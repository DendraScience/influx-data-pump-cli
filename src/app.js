/**
 * Wait for Mongo CLI app.
 *
 * @author J. Scott Smith
 * @license BSD-2-Clause-FreeBSD
 * @module app
 */

const Agent = require('agentkeepalive')
const { HttpsAgent } = require('agentkeepalive')
const axios = require('axios')
const Influx = require('influx')
const copy = require('./copy')
const count = require('./count')
const { ping } = require('./utils')

function agentOptions() {
  return {
    timeout: 60000,
    freeSocketTimeout: 30000
  }
}

const httpAgent = new Agent(agentOptions())
const httpsAgent = new HttpsAgent(agentOptions())

module.exports = async logger => {
  const app = {}

  // App setup
  app.eval = async p => {
    if (!p.dest_host) throw new Error('Required: dest_host')
    if (!p.dest_port) throw new Error('Required: dest_port')
    if (!p.source_host) throw new Error('Required: source_host')
    if (!p.source_port) throw new Error('Required: source_port')
    if (
      !p.count_only &&
      `${p.source_host}:${p.source_port}` === `${p.dest_host}:${p.dest_port}`
    )
      throw new Error('Source and dest cannot be the same server')

    const batchDelay = p.batch_delay | 0
    const batchSize = p.batch_size | 0
    const queryLimit = p.query_limit | 0
    const maxRetries = p.max_retries | 0
    const retryDelay = p.retry_delay | 0
    const beginsAt = p.begins_at && new Date(p.begins_at)
    const endsBefore = p.ends_before && new Date(p.ends_before)
    const databases = p.databases && p.databases.split(',')
    const measurements = p.measurements && p.measurements.split(',')
    const skipDatabases = p.skip_databases && p.skip_databases.split(',')
    const skipMeasurements =
      p.skip_measurements && p.skip_measurements.split(',')
    const postSummaryURL = p.post_summary_url
    const summary = {
      databases: [],
      stats: {
        databases_processed_count: 0,
        databases_skipped_count: 0,
        measurements_processed_count: 0,
        measurements_skipped_count: 0,
        points_written: 0,
        started_at: new Date(),
        values_count: 0
      }
    }

    logger.info(`Connecting to source: ${p.source_host}:${p.source_port}`)
    const sourceInflux = new Influx.InfluxDB({
      database: '_internal',
      host: p.source_host,
      options: {
        agent: p.source_https ? httpsAgent : httpAgent
      },
      port: p.source_port,
      protocol: p.source_https ? 'https' : 'http'
    })
    await ping(sourceInflux, { logger })

    let destInflux
    if (!p.count_only) {
      logger.info(`Connecting to dest: ${p.dest_host}:${p.dest_port}`)
      destInflux = new Influx.InfluxDB({
        host: p.dest_host,
        options: {
          agent: p.dest_https ? httpsAgent : httpAgent
        },
        port: p.dest_port,
        protocol: p.dest_https ? 'https' : 'http'
      })
      await ping(destInflux, { logger })
    }

    let dbNames = await sourceInflux.getDatabaseNames()
    if (p.sort_by_name)
      dbNames = dbNames.sort((a, b) =>
        a.localeCompare(b, 'en', { sensitivity: 'base' })
      )

    logger.info(`Found ${dbNames.length} source database(s).`)

    // Iterate over databases
    for (const dbName of dbNames) {
      const database = {
        is_created: false,
        is_processed: false,
        is_skipped: false,
        name: dbName,
        stats: {
          measurements_processed_count: 0,
          measurements_skipped_count: 0,
          points_written: 0,
          values_count: 0
        }
      }
      summary.databases.push(database)

      if (
        dbName.startsWith('_') ||
        (databases && !databases.includes(dbName)) ||
        (skipDatabases && skipDatabases.includes(dbName))
      ) {
        logger.info(`Skipping source database: ${dbName}`)
        database.is_skipped = true
        summary.stats.databases_skipped_count++
        continue
      }

      logger.info(`Processing source database: ${dbName}`)

      database.measurements = []
      let mmNames = await sourceInflux.getMeasurements(dbName)
      if (p.sort_by_name)
        mmNames = mmNames.sort((a, b) =>
          a.localeCompare(b, 'en', { sensitivity: 'base' })
        )

      logger.info(`Found ${mmNames.length} source measurement(s).`)

      // Iterate over measurements
      for (const mmName of mmNames) {
        const measurement = {
          is_processed: false,
          is_skipped: false,
          name: mmName,
          stats: {
            points_written: 0,
            values_count: 0
          }
        }
        database.measurements.push(measurement)

        if (
          mmName.startsWith('_') ||
          (measurements &&
            !(
              measurements.includes(mmName) ||
              measurements.includes(`${dbName}.${mmName}`)
            )) ||
          (skipMeasurements &&
            (skipMeasurements.includes(mmName) ||
              skipMeasurements.includes(`${dbName}.${mmName}`)))
        ) {
          logger.info(`Skipping source measurement: ${mmName}`)
          measurement.is_skipped = true
          database.stats.measurements_skipped_count++
          summary.stats.measurements_skipped_count++
          continue
        }

        logger.info(`Processing source measurement: ${mmName}`)

        const ctx = {
          batchDelay,
          batchSize,
          beginsAt,
          database,
          dbName,
          destInflux,
          endsBefore,
          logger,
          maxRetries,
          measurement,
          mmName,
          p,
          queryLimit,
          retryDelay,
          sourceInflux,
          summary
        }
        if (p.count_only) await count(ctx)
        else await copy(ctx)

        measurement.is_processed = true
        database.stats.measurements_processed_count++
        summary.stats.measurements_processed_count++
      }

      database.is_processed = true
      summary.stats.databases_processed_count++
    }

    const finishedAt = new Date()
    summary.stats.duration = finishedAt - summary.stats.started_at
    summary.stats.finished_at = finishedAt

    if (postSummaryURL) {
      logger.info(`POSTing summary to: ${postSummaryURL}`)
      await axios.post(postSummaryURL, summary)
    }

    logger.info({ summary })
    logger.info('Done!')
  }

  return app
}
