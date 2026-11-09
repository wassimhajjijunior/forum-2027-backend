import { logger, serializeError } from './requestLogger.js';

export function notFound(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  });
}

export function errorHandler(err, req, res, _next) {
  const requestId = req.requestId;

  if (res.headersSent) {
    logger.error({
      requestId,
      event: 'response_already_started',
      err: serializeError(err),
    });
    res.destroy();
    return;
  }

  if (err && err.type === 'entity.too.large') {
    logger.warn({
      requestId,
      event: 'request_rejected',
      reason: 'payload_too_large',
    });
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    });
    return;
  }

  if (err && err.type === 'entity.parse.failed') {
    logger.warn({
      requestId,
      event: 'request_rejected',
      reason: 'invalid_json',
    });
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Malformed JSON body.' },
    });
    return;
  }

  logger.error({
    requestId,
    event: 'unhandled_error',
    err: serializeError(err),
  });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
  });
}
