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
      dest_port: 'dest-port',
      dry_run: 'dry-run',
      ends_before: 'ends-before',
      max_retries: 'max-retries',
      query_limit: 'query-limit',
      retry_delay: 'retry-delay',
      source_host: 'source-host',
      source_port: 'source-port'
    },
    default: {
      batch_delay: 0,
      batch_size: 5000,
      dest_host: '127.0.0.1',
      dest_port: 8086,
      max_retries: 3,
      precision: 'ms',
      query_limit: 5000,
      retry_delay: 5000,
      source_host: '127.0.0.1',
      source_port: 8086
    },
    boolean: ['count_only', 'dry_run'],
    string: ['begins_at', 'databases', 'dest_host', 'ends_before', 'measurements', 'precision', 'source_host']
  });
  return app.eval(parsed);
});