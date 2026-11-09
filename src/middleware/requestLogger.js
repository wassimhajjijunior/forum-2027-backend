import { randomUUID } from 'node:crypto';

function emit(level, fields) {
  const entry = { ts: new Date().toISOString(), level, ...fields };
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(entry)}\n`);
}

export const logger = {
  info(fields = {}) {
    emit('info', fields);
  },
  warn(fields = {}) {
    emit('warn', fields);
  },
  error(fields = {}) {
    emit('error', fields);
  },
};

export function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(typeof error.code === 'string' ? { code: error.code } : {}),
    };
  }
  if (error !== null && typeof error === 'object') {
    // `details` and `hint` are intentionally excluded: PostgREST can populate
    // them with failing row values, which may contain submitted personal data.
    const serialized = {};
    for (const key of ['name', 'message', 'code', 'stack']) {
      if (error[key] !== undefined) serialized[key] = error[key];
    }
    return Object.keys(serialized).length > 0
      ? serialized
      : { message: Object.prototype.toString.call(error) };
  }
  return { message: String(error) };
}

export function requestLogger(req, res, next) {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info({
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 1000) / 1000,
    });
  });

  next();
}
