import { describe, it, expect } from "vitest";
import { sign, verify } from "../src/index";

const SECRET = "shared-secret-abc";
const BODY = JSON.stringify({ op: "resolve", round: 3 });

describe("HMAC sign/verify", () => {
  it("verifies a freshly signed request", () => {
    const now = 1_000_000;
    const signed = sign(SECRET, BODY, now);
    expect(verify(SECRET, BODY, signed, { now })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const now = 1_000_000;
    const signed = sign(SECRET, BODY, now);
    expect(verify(SECRET, '{"op":"resolve","round":4}', signed, { now })).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const now = 1_000_000;
    const signed = sign(SECRET, BODY, now);
    expect(verify("other-secret", BODY, signed, { now })).toBe(false);
  });

  it("rejects a replay outside the ±30s window", () => {
    const signedAt = 1_000_000;
    const signed = sign(SECRET, BODY, signedAt);
    // 31s later
    expect(verify(SECRET, BODY, signed, { now: signedAt + 31_000 })).toBe(false);
    // 31s earlier (clock skew the other way)
    expect(verify(SECRET, BODY, signed, { now: signedAt - 31_000 })).toBe(false);
  });

  it("accepts within the window (edge)", () => {
    const signedAt = 1_000_000;
    const signed = sign(SECRET, BODY, signedAt);
    expect(verify(SECRET, BODY, signed, { now: signedAt + 30_000 })).toBe(true);
  });

  it("rejects a non-numeric timestamp", () => {
    const signed = sign(SECRET, BODY, 1_000_000);
    expect(verify(SECRET, BODY, { ...signed, timestamp: "nope" })).toBe(false);
  });

  it("rejects a malformed signature length without throwing", () => {
    const now = 1_000_000;
    const signed = sign(SECRET, BODY, now);
    expect(verify(SECRET, BODY, { ...signed, signature: "ab" }, { now })).toBe(false);
  });
});
