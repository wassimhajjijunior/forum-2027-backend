const ALLOWED_KEYS = new Set(['name', 'email', 'university', 'website']);
const CONTROL_CHARS = /\p{Cc}/gu;
const CONTROL_CHARS_TEST = /\p{Cc}/u;

const EMAIL_REGEX =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const RAW_MAX = { name: 200, email: 320, university: 300 };
const CLEANED_MIN = { name: 2, university: 2 };
const CLEANED_MAX = { name: 100, email: 254, university: 150 };

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function honeypotToString(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  // Objects/arrays are not valid honeypot input; treat any payload as bot-like.
  if (typeof value === 'object') {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : '';
  }
  // Numbers and booleans are not text typed into a hidden field. Treating them
  // as empty avoids silently discarding real submissions sent as `false`/`0`.
  return '';
}

export function isHoneypotTriggered(body) {
  if (!isPlainObject(body)) return false;
  if (!Object.prototype.hasOwnProperty.call(body, 'website')) return false;
  return honeypotToString(body.website).trim() !== '';
}

function cleanText(value) {
  return value.trim().replace(CONTROL_CHARS, '').normalize('NFC').trim();
}

function characterCount(value) {
  return [...value].length;
}

function validateText(value, field, label, errors) {
  if (value === undefined) {
    errors.push({ field, message: `${label} is required.` });
    return null;
  }
  if (typeof value !== 'string') {
    errors.push({ field, message: `${label} must be a string.` });
    return null;
  }
  if (value.length > RAW_MAX[field]) {
    errors.push({ field, message: `${label} is too long.` });
    return null;
  }

  const cleaned = cleanText(value);
  const length = characterCount(cleaned);
  if (length < CLEANED_MIN[field] || length > CLEANED_MAX[field]) {
    errors.push({
      field,
      message: `${label} must be between ${CLEANED_MIN[field]} and ${CLEANED_MAX[field]} characters.`,
    });
    return null;
  }

  return cleaned;
}

function validateEmail(value, errors) {
  if (value === undefined) {
    errors.push({ field: 'email', message: 'Email is required.' });
    return null;
  }
  if (typeof value !== 'string') {
    errors.push({ field: 'email', message: 'Email must be a string.' });
    return null;
  }
  if (value.length > RAW_MAX.email) {
    errors.push({ field: 'email', message: 'Email is too long.' });
    return null;
  }
  if (CONTROL_CHARS_TEST.test(value)) {
    errors.push({ field: 'email', message: 'Email contains invalid characters.' });
    return null;
  }

  const email = value.trim().toLowerCase();
  if (email.length > CLEANED_MAX.email) {
    errors.push({ field: 'email', message: 'Email is too long.' });
    return null;
  }
  if (!EMAIL_REGEX.test(email)) {
    errors.push({ field: 'email', message: 'Email must be a valid email address.' });
    return null;
  }

  return email;
}

export function validateRegistration(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    errors.push({ field: 'body', message: 'Request body must be a JSON object.' });
    return { value: null, errors };
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push({ field: key, message: 'This field is not allowed.' });
    }
  }

  const name = validateText(body.name, 'name', 'Name', errors);
  const email = validateEmail(body.email, errors);
  const university = validateText(body.university, 'university', 'University', errors);

  if (errors.length > 0) return { value: null, errors };

  return { value: { name, email, university }, errors };
}

function parseIntegerQuery(raw, field, defaultValue, min, max, message) {
  if (raw === undefined) return { value: defaultValue };
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    return { error: { field, message } };
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return { error: { field, message } };
  }
  return { value: parsed };
}

export function parsePagination(query = {}) {
  const errors = [];

  const pageResult = parseIntegerQuery(
    query.page,
    'page',
    1,
    1,
    Number.MAX_SAFE_INTEGER,
    'page must be an integer greater than or equal to 1.',
  );
  if (pageResult.error) errors.push(pageResult.error);

  const pageSizeResult = parseIntegerQuery(
    query.page_size,
    'page_size',
    20,
    1,
    100,
    'page_size must be an integer between 1 and 100.',
  );
  if (pageSizeResult.error) errors.push(pageSizeResult.error);

  const page = pageResult.value ?? 1;
  const pageSize = pageSizeResult.value ?? 20;

  if (errors.length === 0 && !Number.isSafeInteger((page - 1) * pageSize)) {
    errors.push({ field: 'page', message: 'page is too large.' });
  }

  return { page, pageSize, errors };
}
