import http from 'node:http';
import app from './app.js';
import { config } from './config.js';
import { logger, serializeError } from './middleware/requestLogger.js';

const server = http.createServer(app);

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ event: 'server_shutdown_started', signal });

  const forceExitTimer = setTimeout(() => {
    logger.error({ event: 'server_force_exit' });
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  server.close((error) => {
    clearTimeout(forceExitTimer);
    if (error) {
      logger.error({
        event: 'server_close_failed',
        err: serializeError(error),
      });
      process.exit(1);
      return;
    }
    logger.info({ event: 'server_stopped' });
    process.exit(0);
  });

  server.closeIdleConnections?.();
}

server.on('error', (error) => {
  logger.error({ event: 'server_error', err: serializeError(error) });
  process.exit(1);
});

server.listen(config.port, '0.0.0.0', () => {
  logger.info({
    event: 'server_started',
    port: config.port,
    rate_limit_enabled: config.rateLimitEnabled,
  });
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({
    event: 'unhandled_rejection',
    err: serializeError(reason),
  });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error({
    event: 'uncaught_exception',
    err: serializeError(error),
  });
  process.exit(1);
});
