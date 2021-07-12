#!/usr/bin/env node

/**
 * Influx Data Pump CLI entry point.
 *
 * @author J. Scott Smith
 * @license BSD-2-Clause-FreeBSD
 * @module influx-data-pump
 */
"use strict";

const mri = require('mri');

const path = require('path');

const pino = require('pino');

const logger = pino({
  // level: process.env.LOGLEVEL,
  name: path.basename(process.argv[1], '.js')
}); // Pino alternatives

process.on('uncaughtException', pino.final(logger, (err, finalLogger) => {
  finalLogger.error(err, 'uncaughtException');
  process.exit(1);
}));
process.on('unhandledRejection', pino.final(logger, (err, finalLogger) => {
  finalLogger.error(err, 'unhandledRejection');
  process.exit(1);
})); // process.on('uncaughtException', err => {
//   logger.error(`An unexpected error occurred\n  ${err.stack}`)
//   process.exit(1)
// })
// process.on('unhandledRejection', err => {
//   if (!err) {
//     logger.error('An unexpected empty rejection occurred')
//   } else if (err instanceof Error) {
//     logger.error(`An unexpected rejection occurred\n  ${err.stack}`)
//   } else {
//     logger.error(`An unexpected rejection occurred\n  ${err}`)
//   }
//   process.exit(1)
// })

require('./app')(logger).then(app => {
  const args = process.argv.slice(2);
  const parsed = mri(args, {
    alias: {
      batch_delay: 'batch-delay',
      batch_size: 'batch-size,',
      begins_at: 'begins-at',
      count_only: 'count-only',
      dest_host: 'dest-host',
      dest_https: 'dest-https',
      dest_port: 'dest-port',
      ends_before: 'ends-before',
      max_retries: 'max-retries',
      post_summary_url: 'post-summary-url',
      query_limit: 'query-limit',
      retry_delay: 'retry-delay',
      skip_databases: 'skip-databases',
      skip_measurements: 'skip-measurements',
      sort_by_name: 'sort-by-name',
      source_host: 'source-host',
      source_https: 'source-https',
      source_port: 'source-port'
    },
    default: {
      batch_delay: 0,
      batch_size: 5000,
      dest_host: '127.0.0.1',
      dest_https: false,
      dest_port: 8086,
      max_retries: 3,
      precision: 'ms',
      query_limit: 5000,
      retry_delay: 5000,
      sort_by_name: false,
      source_host: '127.0.0.1',
      source_https: false,
      source_port: 8086
    },
    boolean: ['count_only', 'dest_https', 'sort_by_name', 'source_https'],
    string: ['begins_at', 'databases', 'dest_host', 'ends_before', 'measurements', 'post_summary_url', 'precision', 'skip_databases', 'skip_measurements', 'source_host']
  });
  return app.eval(parsed);
});