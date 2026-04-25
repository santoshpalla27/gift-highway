/**
 * k6 Rate Limit Test — General API Burst
 *
 * Authenticates once, then hammers GET /api/v1/orders with
 * rapid requests to trigger the global rate limiter.
 *
 * Usage:
 *   k6 run tests/load/k6-api-burst.js
 */

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

const rateLimited = new Counter("rate_limited_responses");
const successResponses = new Counter("success_responses");

// Login once in setup and share the token
export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({
      email: "admin@company.com",
      password: "Admin@123456",
    }),
    { headers: { "Content-Type": "application/json" }, timeout: "10s" }
  );

  if (loginRes.status !== 200) {
    throw new Error(`Login failed: ${loginRes.status} ${loginRes.body}`);
  }

  const body = JSON.parse(loginRes.body);
  return { token: body.tokens.access_token };
}

export const options = {
  scenarios: {
    api_burst: {
      executor: "shared-iterations",
      vus: 25,
      iterations: 400,
      maxDuration: "30s",
    },
  },
  thresholds: {
    rate_limited_responses: ["count>0"],
  },
};

export default function (data) {
  const params = {
    headers: {
      Authorization: `Bearer ${data.token}`,
      "Content-Type": "application/json",
    },
    timeout: "10s",
  };

  const res = http.get(`${BASE_URL}/api/v1/orders?page=1&limit=5`, params);

  if (res.status === 429) {
    rateLimited.add(1);
  }

  if (res.status === 200) {
    successResponses.add(1);
  }

  check(res, {
    "status is 200 or 429": (r) => r.status === 200 || r.status === 429,
    "no server error": (r) => r.status < 500,
  });
}

export function handleSummary(data) {
  const rl = data.metrics.rate_limited_responses
    ? data.metrics.rate_limited_responses.values.count
    : 0;
  const ok = data.metrics.success_responses
    ? data.metrics.success_responses.values.count
    : 0;

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  API Burst Rate Limit Test Results`);
  console.log(`═══════════════════════════════════════`);
  console.log(`  Rate-limited (429): ${rl}`);
  console.log(`  Successful (200):   ${ok}`);
  console.log(
    `  Result: ${rl > 0 ? "✅ PASS — Rate limiter triggered" : "❌ FAIL — No 429 responses"}`
  );
  console.log(`═══════════════════════════════════════\n`);

  return {};
}
