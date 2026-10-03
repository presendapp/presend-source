// Counts API calls per day, endpoint and User-Agent family in D1.
// D1 rather than KV: the KV namespace is shared with every rate limit and
// capped at 1,000 writes/day on the free plan (lesson 10).
// Recording happens after the response (waitUntil) and can never make a
// request fail. OPTIONS, test calls and 404s are not counted.
import { uaFamily, endpointOf } from "../_shared/usage.js";

const UPSERT =
  "INSERT INTO api_usage (day, endpoint, ua_family, calls) VALUES (?, ?, ?, 1) " +
  "ON CONFLICT (day, endpoint, ua_family) DO UPDATE SET calls = calls + 1";

export async function onRequest(context) {
  const response = await context.next();
  const { request, env } = context;
  try {
    if (env.DB && request.method !== "OPTIONS" && response.status !== 404 &&
        request.headers.get("X-Presend-Test") !== "1") {
      const day = new Date().toISOString().slice(0, 10);
      const endpoint = endpointOf(new URL(request.url).pathname);
      // Our own /check page identifies itself (js/check-deps.js); only this exact value is kept.
      const family = request.headers.get("X-Presend-Client") === "check" ? "web:check" : uaFamily(request.headers.get("User-Agent"));
      context.waitUntil(env.DB.prepare(UPSERT).bind(day, endpoint, family).run().catch(() => {}));
    }
  } catch (e) {
    // Counting must never affect the response.
  }
  return response;
}
