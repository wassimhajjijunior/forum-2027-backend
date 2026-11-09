import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { supabase } from '../supabase.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { logger, serializeError } from '../middleware/requestLogger.js';
import {
  isHoneypotTriggered,
  parsePagination,
  validateRegistration,
} from '../lib/validation.js';
import {
  CSV_HEADER_LINE,
  registrationCsvLine,
} from '../lib/csv.js';

const EXPORT_BATCH_SIZE = 1000;
const EXPORT_COLUMNS = 'id, full_name, email, university, created_at';

const router = Router();

const registerRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    });
  },
});

const registerMiddleware = config.rateLimitEnabled ? [registerRateLimiter] : [];

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function createRegistration(req, res) {
  if (isHoneypotTriggered(req.body)) {
    res.status(201).json({
      data: { id: randomUUID(), created_at: new Date().toISOString() },
    });
    return;
  }

  const { value, errors } = validateRegistration(req.body);
  if (errors.length > 0) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'One or more fields are invalid.',
        details: errors,
      },
    });
    return;
  }

  const { data, error } = await supabase
    .from('registrations')
    .insert({
      full_name: value.name,
      email: value.email,
      university: value.university,
    })
    .select('id, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      res.status(409).json({
        error: {
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'This email is already registered.',
        },
      });
      return;
    }
    throw error;
  }

  if (!data) {
    throw new Error('Registration insert did not return a row.');
  }

  res.status(201).json({
    data: { id: data.id, created_at: data.created_at },
  });
}

async function listRegistrations(req, res) {
  const { page, pageSize, errors } = parsePagination(req.query);

  if (errors.length > 0) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters.',
        details: errors,
      },
    });
    return;
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('registrations')
    .select('id, full_name, email, university, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  const rows = data ?? [];
  const total = typeof count === 'number' ? count : 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  res.status(200).json({
    data: rows,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    },
  });
}

function writeWithBackpressure(res, chunk) {
  return new Promise((resolve) => {
    if (res.destroyed || res.writableEnded) {
      resolve();
      return;
    }
    if (res.write(chunk)) {
      resolve();
      return;
    }

    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      res.off('error', done);
      resolve();
    };

    res.once('drain', done);
    res.once('close', done);
    res.once('error', done);
  });
}

async function fetchExportBatch(offset) {
  const { data, error } = await supabase
    .from('registrations')
    .select(EXPORT_COLUMNS)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + EXPORT_BATCH_SIZE - 1);

  if (error) throw error;
  return data ?? [];
}

async function exportRegistrations(req, res) {
  // Fetch the first batch before sending headers so a database failure can
  // still be reported as a JSON 500 instead of a truncated CSV with status 200.
  let rows = await fetchExportBatch(0);

  const date = new Date().toISOString().slice(0, 10);

  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="registrations-${date}.csv"`,
  );
  res.setHeader('Cache-Control', 'no-store');

  res.on('error', (error) => {
    logger.error({
      requestId: req.requestId,
      event: 'registrations_export_stream_error',
      err: serializeError(error),
    });
  });

  try {
    await writeWithBackpressure(res, CSV_HEADER_LINE);

    let offset = 0;
    for (;;) {
      for (const row of rows) {
        if (res.destroyed || res.writableEnded) return;
        await writeWithBackpressure(res, registrationCsvLine(row));
      }

      if (rows.length < EXPORT_BATCH_SIZE) break;

      offset += EXPORT_BATCH_SIZE;
      rows = await fetchExportBatch(offset);
      if (res.destroyed || res.writableEnded) return;
    }

    if (!res.destroyed && !res.writableEnded) res.end();
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      event: 'registrations_export_failed',
      err: serializeError(error),
    });
    if (!res.destroyed) res.destroy();
  }
}

router.post(
  '/register',
  ...registerMiddleware,
  asyncHandler(createRegistration),
);

router.get(
  '/registrations/export',
  adminAuth,
  asyncHandler(exportRegistrations),
);

router.get(
  '/registrations',
  adminAuth,
  asyncHandler(listRegistrations),
);

export default router;
