/**
 * k6 Rate Limit Test — Login Endpoint
 *
 * Sends a burst of login requests to verify the rate limiter
 * kicks in with HTTP 429 responses.
 *
 * Usage:
 *   k6 run tests/load/k6-login-ratelimit.js
 *
 * Expected: At least some requests return 429 (Too Many Requests)
 * when the burst exceeds RATE_LIMIT_BURST (default: 200).
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

const rateLimited = new Counter("rate_limited_responses");
const successResponses = new Counter("success_responses");

export const options = {
  scenarios: {
    login_burst: {
      executor: "shared-iterations",
      vus: 20,
      iterations: 300,
      maxDuration: "30s",
    },
  },
  thresholds: {
    // At least 1 request should be rate-limited
    rate_limited_responses: ["count>0"],
  },
};

export default function () {
  const payload = JSON.stringify({
    email: "admin@company.com",
    password: "WrongPassword1", // Intentionally wrong — we're testing rate limits, not auth
  });

  const params = {
    headers: { "Content-Type": "application/json" },
    timeout: "10s",
  };

  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, params);

  if (res.status === 429) {
    rateLimited.add(1);
  }

  if (res.status === 401 || res.status === 200) {
    successResponses.add(1);
  }

  check(res, {
    "status is 200, 401, or 429": (r) =>
      r.status === 200 || r.status === 401 || r.status === 429,
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
  console.log(`  Login Rate Limit Test Results`);
  console.log(`═══════════════════════════════════════`);
  console.log(`  Rate-limited (429): ${rl}`);
  console.log(`  Processed (200/401): ${ok}`);
  console.log(
    `  Result: ${rl > 0 ? "✅ PASS — Rate limiter triggered" : "❌ FAIL — No 429 responses"}`
  );
  console.log(`═══════════════════════════════════════\n`);

  return {};
}
