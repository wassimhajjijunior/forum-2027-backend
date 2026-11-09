import dotenv from 'dotenv';

dotenv.config();

const problems = [];

function markInvalid(name) {
  if (!problems.includes(name)) problems.push(name);
}

function readTrimmed(name) {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return raw.trim();
}

function readInteger(name, defaultValue, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    markInvalid(name);
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    markInvalid(name);
    return defaultValue;
  }
  return parsed;
}

function normalizeOrigin(entry) {
  if (entry === '' || entry.includes('*') || entry.endsWith('/')) return null;
  if (!URL.canParse(entry)) return null;
  const parsed = new URL(entry);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return null;
  return parsed.origin;
}

const supabaseUrl = readTrimmed('SUPABASE_URL');
if (supabaseUrl === null) {
  markInvalid('SUPABASE_URL');
} else if (!URL.canParse(supabaseUrl)) {
  markInvalid('SUPABASE_URL');
} else {
  const parsed = new URL(supabaseUrl);
  if (parsed.protocol !== 'https:' || parsed.hostname === '') markInvalid('SUPABASE_URL');
}

const supabaseServiceRoleKey = readTrimmed('SUPABASE_SERVICE_ROLE_KEY');
if (supabaseServiceRoleKey === null || supabaseServiceRoleKey.length < 20) {
  markInvalid('SUPABASE_SERVICE_ROLE_KEY');
}

const adminApiKey = readTrimmed('ADMIN_API_KEY');
if (adminApiKey === null || adminApiKey.length < 16) {
  markInvalid('ADMIN_API_KEY');
}

let corsOrigins = [];
const rawCorsOrigin = process.env.CORS_ORIGIN;
if (typeof rawCorsOrigin !== 'string' || rawCorsOrigin.trim() === '') {
  markInvalid('CORS_ORIGIN');
} else {
  const entries = rawCorsOrigin.split(',').map((entry) => entry.trim());
  const normalized = [];
  for (const entry of entries) {
    const origin = normalizeOrigin(entry);
    if (origin === null) {
      markInvalid('CORS_ORIGIN');
      break;
    }
    if (!normalized.includes(origin)) normalized.push(origin);
  }
  if (problems.includes('CORS_ORIGIN') === false) corsOrigins = normalized;
}

const port = readInteger('PORT', 3000, 1, 65535);

let bodyLimit = '10kb';
const rawBodyLimit = process.env.BODY_LIMIT;
if (rawBodyLimit !== undefined && rawBodyLimit.trim() !== '') {
  const value = rawBodyLimit.trim();
  const match = /^(\d+(?:\.\d+)?)(b|kb|mb)$/i.exec(value);
  if (!match || Number(match[1]) <= 0) {
    markInvalid('BODY_LIMIT');
  } else {
    bodyLimit = value;
  }
}

let rateLimitEnabled = true;
const rawRateLimitEnabled = process.env.RATE_LIMIT_ENABLED;
if (rawRateLimitEnabled !== undefined && rawRateLimitEnabled.trim() !== '') {
  const value = rawRateLimitEnabled.trim();
  if (value === 'true') {
    rateLimitEnabled = true;
  } else if (value === 'false') {
    rateLimitEnabled = false;
  } else {
    markInvalid('RATE_LIMIT_ENABLED');
  }
}

const rateLimitWindowMs = readInteger('RATE_LIMIT_WINDOW_MS', 60000, 1, Number.MAX_SAFE_INTEGER);
const rateLimitMax = readInteger('RATE_LIMIT_MAX', 10, 1, Number.MAX_SAFE_INTEGER);

if (problems.length > 0) {
  process.stderr.write(
    `Configuration error. Missing or invalid environment variables: ${problems.join(', ')}\n`,
  );
  process.exit(1);
}

export const config = Object.freeze({
  supabaseUrl,
  supabaseServiceRoleKey,
  adminApiKey,
  corsOrigins: Object.freeze(corsOrigins),
  port,
  bodyLimit,
  rateLimitEnabled,
  rateLimitWindowMs,
  rateLimitMax,
});
