// Simple in-memory rate limiter keyed by IP address.
// Per-instance only — in a multi-instance (serverless) deployment, replace
// with a KV-backed solution (e.g. Vercel KV / Upstash Redis) for global limits.

type Entry = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 15;
// Upper bound on tracked keys so a flood of spoofed client IPs cannot grow the
// map without limit (memory-exhaustion DoS).
const MAX_TRACKED_KEYS = 10_000;
// Requests served with the server's shared GROQ_API_KEY also share one global
// budget, so rotating a spoofed X-Forwarded-For cannot burn through the key.
const GLOBAL_MAX_REQUESTS = 120;

const requests = new Map<string, Entry>();
const globalBucket: Entry = { count: 0, resetAt: 0 };
let lastSweep = 0;

// IPv4 / IPv6 literal characters only, bounded length. Anything else is
// attacker-controlled garbage and collapses into the "unknown" bucket.
const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const candidate =
    (forwarded ? forwarded.split(",")[0].trim() : "") ||
    req.headers.get("x-real-ip")?.trim() ||
    "";
  return IP_PATTERN.test(candidate) ? candidate : "unknown";
}

function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS && requests.size < MAX_TRACKED_KEYS) return;
  lastSweep = now;
  for (const [key, entry] of requests) {
    if (now >= entry.resetAt) requests.delete(key);
  }
  // Still full of live entries: drop the oldest ones (Map keeps insertion order).
  if (requests.size >= MAX_TRACKED_KEYS) {
    const excess = requests.size - MAX_TRACKED_KEYS + 1;
    let removed = 0;
    for (const key of requests.keys()) {
      requests.delete(key);
      if (++removed >= excess) break;
    }
  }
}

export function checkRateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  sweep(now);
  const entry = requests.get(ip);

  if (!entry || now >= entry.resetAt) {
    requests.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { ok: true };
}

/** Shared budget for requests that spend the server-side default API key. */
export function checkGlobalRateLimit(): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  if (now >= globalBucket.resetAt) {
    globalBucket.count = 1;
    globalBucket.resetAt = now + WINDOW_MS;
    return { ok: true };
  }
  if (globalBucket.count >= GLOBAL_MAX_REQUESTS) {
    return { ok: false, retryAfter: Math.ceil((globalBucket.resetAt - now) / 1000) };
  }
  globalBucket.count++;
  return { ok: true };
}

/** Test helper: clears all limiter state. */
export function resetRateLimits() {
  requests.clear();
  globalBucket.count = 0;
  globalBucket.resetAt = 0;
  lastSweep = 0;
}
