async function count({
  beginsAt,
  database,
  dbName,
  endsBefore,
  logger,
  measurement,
  mmName,
  p,
  sourceInflux,
  summary
}) {
  const sourceOptions = {
    database: dbName,
    precision: p.precision
  }

  const where = []
  if (beginsAt) where.push(`time >= '${beginsAt.toISOString()}'`)
  if (endsBefore) where.push(`time < '${endsBefore.toISOString()}'`)

  const query = `SELECT count(*) FROM "${mmName}" ${
    where.length ? 'WHERE' : ''
  } ${where.join(' AND ')}`

  logger.info(`Query: ${query}`)

  const results = await sourceInflux.query(query, sourceOptions)

  if (results.length) {
    const fields = results[results.length - 1]
    delete fields.time

    let total = 0
    Object.keys(fields).forEach(key => (total += fields[key]))

    measurement.stats.fields = fields
    measurement.stats.values_count += total
    database.stats.values_count += total
    summary.stats.values_count += total
  }
}

module.exports = count
