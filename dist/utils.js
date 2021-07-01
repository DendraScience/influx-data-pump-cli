"use strict";

async function ping(influx, {
  logger
}) {
  const hosts = await influx.ping(5000);
  hosts.forEach(host => {
    const {
      url,
      online
    } = host;
    logger.info(`Influx host is ${online ? 'online' : 'OFFLINE'}: ${url}`);
  });
}

module.exports = {
  ping
};