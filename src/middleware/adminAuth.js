import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

const expectedDigest = digest(config.adminApiKey);

export function adminAuth(req, res, next) {
  const provided = req.get('x-admin-api-key');

  if (typeof provided !== 'string' || provided.length === 0) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' },
    });
    return;
  }

  const providedDigest = digest(provided);
  if (!timingSafeEqual(providedDigest, expectedDigest)) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' },
    });
    return;
  }

  next();
}
