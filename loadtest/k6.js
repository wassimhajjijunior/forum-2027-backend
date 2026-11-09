import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const VUS = Math.max(1, Number.parseInt(__ENV.K6_VUS || '20', 10) || 20);
const DURATION = __ENV.K6_DURATION || '30s';
const ADMIN_API_KEY = __ENV.K6_ADMIN_API_KEY || '';

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const registerCreated = new Rate('register_created');
const registerRateLimited = new Rate('register_rate_limited');

function parseDurationSeconds(value) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(String(value).trim());
  if (!match) return 30;

  const amount = Number(match[1]);
  switch (match[2]) {
    case 'ms':
      return amount / 1000;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3600;
    default:
      return amount;
  }
}

function stageDuration(seconds) {
  const rounded = Math.max(0.1, Math.round(seconds * 100) / 100);
  return `${rounded}s`;
}

const totalSeconds = parseDurationSeconds(DURATION);
const healthVus = Math.max(1, Math.floor(VUS / 4));

const scenarios = {
  health: {
    executor: 'constant-vus',
    vus: healthVus,
    duration: DURATION,
    exec: 'healthCheck',
    tags: { scenario: 'health' },
  },
  register: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { target: VUS, duration: stageDuration(totalSeconds * 0.25) },
      { target: VUS, duration: stageDuration(totalSeconds * 0.5) },
      { target: 0, duration: stageDuration(totalSeconds * 0.25) },
    ],
    preAllocatedVUs: VUS,
    maxVUs: VUS,
    exec: 'registerUser',
    tags: { scenario: 'register' },
  },
};

if (ADMIN_API_KEY) {
  scenarios.admin_list = {
    executor: 'constant-vus',
    vus: 2,
    duration: DURATION,
    exec: 'adminList',
    tags: { scenario: 'admin_list' },
  };
}

export const options = {
  discardResponseBodies: true,
  scenarios,
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{scenario:health}': ['p95<300'],
    register_created: ['rate>0.95'],
  },
};

export function healthCheck() {
  const response = http.get(`${BASE_URL}/api/health`);
  check(response, {
    'health status is 200': (result) => result.status === 200,
  });
}

export function registerUser() {
  const email =
    `loadtest+${RUN_ID}-${__VU}-${__ITER}-${Math.random().toString(36).slice(2, 8)}` +
    '@example.com';

  const payload = JSON.stringify({
    name: 'Load Test User',
    email,
    university: 'Load Test University',
  });

  const response = http.post(`${BASE_URL}/api/register`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  registerCreated.add(response.status === 201);
  registerRateLimited.add(response.status === 429);

  // A 429 is tolerated here only so load runs can surface the rate-limit metric.
  // The register_created threshold fails if limiting suppresses too many writes.
  check(response, {
    'register accepted': (result) => result.status === 201 || result.status === 429,
  });

  sleep(0.1);
}

export function adminList() {
  const response = http.get(
    `${BASE_URL}/api/registrations?page=1&page_size=20`,
    { headers: { 'X-Admin-Api-Key': ADMIN_API_KEY } },
  );

  check(response, {
    'admin list status is 200': (result) => result.status === 200,
  });
}
