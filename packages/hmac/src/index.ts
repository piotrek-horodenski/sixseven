import { createHmac, timingSafeEqual } from "crypto";

/**
 * Podpisy HMAC żądań platforma→serwis gry.
 *
 * Model (ARCHITECTURE.md / IMPLEMENTATION_PLAN.md): platforma podpisuje każde
 * żądanie silnika (/init, /resolve, ...) sekretem współdzielonym z twórcą gry.
 * Serwis gry weryfikuje podpis. Okno timestamp ±30 s chroni przed replayem i
 * dryfem zegara. Podpis obejmuje timestamp + surowe ciało żądania, więc żadnego
 * bajtu nie da się podmienić po podpisaniu.
 *
 * Kanoniczny komunikat: `${timestamp}.${body}` — HMAC-SHA256, hex.
 */

const DEFAULT_WINDOW_MS = 30_000;

export interface SignedRequest {
  /** Unix ms jako string — wchodzi do nagłówka X-Sixseven-Timestamp. */
  timestamp: string;
  /** Hex HMAC-SHA256 — nagłówek X-Sixseven-Signature. */
  signature: string;
}

function canonical(timestamp: string, body: string): string {
  return `${timestamp}.${body}`;
}

/** Podpisuje ciało żądania. `now` wstrzykiwalny dla testów. */
export function sign(secret: string, body: string, now: number = Date.now()): SignedRequest {
  const timestamp = String(now);
  const signature = createHmac("sha256", secret)
    .update(canonical(timestamp, body))
    .digest("hex");
  return { timestamp, signature };
}

export interface VerifyOptions {
  windowMs?: number;
  now?: number;
}

/**
 * Weryfikuje podpis w stałym czasie i sprawdza okno timestamp.
 * Zwraca true tylko gdy podpis pasuje ORAZ |now - timestamp| ≤ windowMs.
 */
export function verify(
  secret: string,
  body: string,
  provided: SignedRequest,
  options: VerifyOptions = {},
): boolean {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now();

  const ts = Number(provided.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now - ts) > windowMs) return false;

  const expected = createHmac("sha256", secret)
    .update(canonical(provided.timestamp, body))
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided.signature, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
