import { beforeEach, describe, expect, it } from "vitest";
import {
  checkGlobalRateLimit,
  checkRateLimit,
  getClientIp,
  resetRateLimits,
} from "../rate-limit";

const req = (headers: Record<string, string>) => new Request("http://localhost/", { headers });

describe("getClientIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(getClientIp(req({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("maps non-IP garbage to the shared 'unknown' bucket", () => {
    expect(getClientIp(req({ "x-forwarded-for": "<script>alert(1)</script>" }))).toBe("unknown");
    expect(getClientIp(req({ "x-forwarded-for": "a".repeat(5000) }))).toBe("unknown");
    expect(getClientIp(req({}))).toBe("unknown");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("blocks an IP after 15 requests per window", () => {
    for (let i = 0; i < 15; i++) expect(checkRateLimit("1.1.1.1").ok).toBe(true);
    const blocked = checkRateLimit("1.1.1.1");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(checkRateLimit("2.2.2.2").ok).toBe(true);
  });

  it("stays functional when flooded with distinct IPs", () => {
    for (let i = 0; i < 25_000; i++) checkRateLimit(`10.${(i >> 8) & 255}.${i & 255}.${i % 7}`);
    expect(checkRateLimit("9.9.9.9").ok).toBe(true);
  });
});

describe("checkGlobalRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("caps total shared-key requests regardless of IP", () => {
    for (let i = 0; i < 120; i++) expect(checkGlobalRateLimit().ok).toBe(true);
    expect(checkGlobalRateLimit().ok).toBe(false);
  });
});
