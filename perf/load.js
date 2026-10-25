// k6 load profile, identical for all arms. Run after acceptance passes.
//   k6 run -e BASE_URL=http://127.0.0.1:3000 perf/load.js
// Thresholds mirror the spec Constraints (T1): p95 < 50 ms, 0% errors.
import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:3000";

export const options = {
  scenarios: {
    warmup: { executor: "constant-arrival-rate", rate: 50, timeUnit: "1s", duration: "10s",
              preAllocatedVUs: 20, exec: "mixed", tags: { phase: "warmup" } },
    measure: { executor: "constant-arrival-rate", rate: 200, timeUnit: "1s", duration: "60s",
               preAllocatedVUs: 100, startTime: "10s", exec: "mixed", tags: { phase: "measure" } },
  },
  thresholds: {
    "http_req_duration{phase:measure}": ["p(95)<50"],
    "http_req_failed{phase:measure}": ["rate==0"],
  },
  summaryTrendStats: ["p(50)", "p(95)", "p(99)", "avg", "max"],
};

export function setup() {
  const codes = [];
  for (let i = 0; i < 100; i++) {
    const r = http.post(`${BASE}/links`, JSON.stringify({ url: `https://example.com/p/${i}` }),
      { headers: { "content-type": "application/json" } });
    codes.push(r.json("code"));
  }
  return { codes };
}

// 90% redirects, 8% metadata reads, 2% creates.
export function mixed({ codes }) {
  const x = Math.random();
  const code = codes[Math.floor(Math.random() * codes.length)];
  if (x < 0.9) {
    const r = http.get(`${BASE}/${code}`, { redirects: 0, responseCallback: http.expectedStatuses(302) });
    check(r, { "302": (res) => res.status === 302 });
  } else if (x < 0.98) {
    const r = http.get(`${BASE}/links/${code}`);
    check(r, { "200": (res) => res.status === 200 });
  } else {
    const r = http.post(`${BASE}/links`, JSON.stringify({ url: "https://example.com/new" }),
      { headers: { "content-type": "application/json" } });
    check(r, { "201": (res) => res.status === 201 });
  }
}
