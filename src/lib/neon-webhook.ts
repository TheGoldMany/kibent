import crypto from "node:crypto";

/**
 * Neon Auth webhook aláírás-ellenőrzés (Ed25519, leválasztott JWS).
 * https://neon.com/docs/auth/guides/webhooks
 */
export type JwksFetcher = () => Promise<{ keys: (JsonWebKey & { kid?: string })[] }>;

let jwksCache: { keys: (JsonWebKey & { kid?: string })[]; at: number } | null = null;

async function findKey(kid: string, fetchJwks: JwksFetcher) {
  const fresh = jwksCache && Date.now() - jwksCache.at < 60 * 60 * 1000;
  let key = fresh ? jwksCache!.keys.find((k) => k.kid === kid) : undefined;
  if (!key) {
    // Ismeretlen kulcs vagy lejárt gyorsítótár: frissítés (legfeljebb percenként egyszer)
    if (!jwksCache || Date.now() - jwksCache.at > 60 * 1000 || !fresh) {
      const jwks = await fetchJwks();
      jwksCache = { keys: jwks.keys ?? [], at: Date.now() };
    }
    key = jwksCache.keys.find((k) => k.kid === kid);
  }
  return key;
}

export function resetJwksCache() {
  jwksCache = null;
}

export async function verifyNeonWebhook(
  rawBody: string,
  headers: Headers,
  fetchJwks: JwksFetcher,
  now: number = Date.now(),
): Promise<unknown> {
  const signature = headers.get("x-neon-signature");
  const kid = headers.get("x-neon-signature-kid");
  const timestamp = headers.get("x-neon-timestamp");
  if (!signature || !kid || !timestamp) throw new Error("Hiányzó Neon webhook fejlécek");

  const age = now - Number.parseInt(timestamp, 10);
  if (!Number.isFinite(age) || age > 5 * 60 * 1000 || age < -60 * 1000) throw new Error("Lejárt vagy hibás időbélyeg");

  const jwk = await findKey(kid, fetchJwks);
  if (!jwk) throw new Error("Ismeretlen aláíró kulcs");
  const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });

  const [headerB64, emptyPayload, signatureB64] = signature.split(".");
  if (!headerB64 || emptyPayload !== "" || !signatureB64) throw new Error("Hibás JWS formátum");

  const payloadB64 = Buffer.from(rawBody, "utf8").toString("base64url");
  const signingPayloadB64 = Buffer.from(`${timestamp}.${payloadB64}`, "utf8").toString("base64url");
  const ok = crypto.verify(
    null,
    Buffer.from(`${headerB64}.${signingPayloadB64}`),
    publicKey,
    Buffer.from(signatureB64, "base64url"),
  );
  if (!ok) throw new Error("Érvénytelen aláírás");
  return JSON.parse(rawBody);
}
