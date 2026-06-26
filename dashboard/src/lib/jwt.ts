// Minimal client-side JWT helpers for the privacy-proxy paste flow.
// No signature verification — only reads the `exp` claim to gate the UI.

function base64UrlDecode(seg: string): string {
  let b = seg.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  return atob(b);
}

/** Decode a JWT's `exp` (seconds since epoch). Returns null if not decodable. */
export function decodeJwtExp(token: string): number | null {
  const parts = token.trim().split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export interface PrivacyTokenStatus {
  ok: boolean;
  reason?: string; // why not ok (shown in UI)
  secondsLeft?: number; // until expiry
}

/**
 * Validate a pasted privacy JWT for a test of `durationSec`. The test must finish
 * before the token expires (prod tokens are short-lived, ~5 min). An empty token
 * is treated as ok (optional — fall back to the existing/auto-refreshed token file).
 */
export function checkPrivacyToken(
  token: string | undefined,
  durationSec: number
): PrivacyTokenStatus {
  const t = (token ?? "").trim();
  if (!t) return { ok: true };
  if (t.split(".").length < 3) {
    return { ok: false, reason: "Not a JWT (expected header.payload.signature)" };
  }
  const exp = decodeJwtExp(t);
  if (exp == null) return { ok: false, reason: "Could not read token expiry (exp)" };
  const secondsLeft = exp - Math.floor(Date.now() / 1000);
  if (secondsLeft <= 0) return { ok: false, reason: "Token has expired — paste a fresh one", secondsLeft };
  if (durationSec > 0 && secondsLeft <= durationSec) {
    return {
      ok: false,
      reason: `Token expires in ${secondsLeft}s — shorter than the ${durationSec}s test. Shorten the test or paste a fresher token.`,
      secondsLeft,
    };
  }
  return { ok: true, secondsLeft };
}
