"use strict";

async function copy({
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
}) {
  const sourceOptions = {
    database: dbName,
    precision: p.precision
  };
  const destOptions = {
    database: dbName,
    precision: p.precision
  };
  let lastTime;

  while (true) {
    const where = [];
    if (lastTime) where.push(`time > '${lastTime.toNanoISOString()}'`);else if (beginsAt) where.push(`time >= '${beginsAt.toISOString()}'`);
    if (endsBefore) where.push(`time < '${endsBefore.toISOString()}'`);
    const query = `SELECT * FROM "${mmName}" ${where.length ? 'WHERE' : ''} ${where.join(' AND ')} LIMIT ${queryLimit}`;
    logger.info(`Query: ${query}`);
    const results = await sourceInflux.query(query, sourceOptions);
    logger.info(`Found ${results.length} source points(s).`);
    if (!results.length) break;
    lastTime = results[results.length - 1].time; // Map results tp points for writing

    const points = [];

    for (let i = 0; i < results.length; i++) {
      const fields = results[i];
      points.push({
        fields,
        measurement: mmName,
        timestamp: fields.time
      });
      delete fields.time;
      Object.keys(fields).forEach(key => {
        const val = fields[key];
        if (val === null || val === '') delete fields[key];
      });
    }

    for (let i = 0; i < points.length; i += batchSize) {
      const pointsBatch = points.slice(i, i + batchSize);
      let retries = 0;

      while (true) {
        try {
          let createDb = false;

          try {
            await destInflux.writePoints(pointsBatch, destOptions);
          } catch (err) {
            if (err.res && err.res.statusCode === 404) {
              logger.warn(`Dest database not found, creating it.`);
              createDb = true;
            } else {
              throw err;
            }
          }

          if (createDb) {
            await destInflux.createDatabase(dbName);
            database.is_created = true;
            await destInflux.writePoints(pointsBatch, destOptions);
          }

          break;
        } catch (err) {
          logger.error(`Error writing points: ${err.message}`);
        }

        if (retries++ >= maxRetries) throw new Error('Max retry attempts reached.');

        if (retryDelay > 0) {
          logger.warn(`Retrying points writing in ${retryDelay} ms.`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

      logger.info(`Wrote ${pointsBatch.length} dest points(s).`);
      measurement.stats.points_written += pointsBatch.length;
      database.stats.points_written += pointsBatch.length;
      summary.stats.points_written += pointsBatch.length;

      if (batchDelay > 0) {
        logger.warn(`Resuming points writing in ${batchDelay} ms.`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }
  }
}

module.exports = copy;