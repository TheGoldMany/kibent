import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetJwksCache, verifyNeonWebhook } from "./neon-webhook";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "kulcs-1" };
const fetchJwks = async () => ({ keys: [jwk] });

function sign(body: string, timestamp: number, key = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWS", kid: "kulcs-1" })).toString("base64url");
  const payloadB64 = Buffer.from(body).toString("base64url");
  const signingPayloadB64 = Buffer.from(`${timestamp}.${payloadB64}`).toString("base64url");
  const sig = crypto.sign(null, Buffer.from(`${header}.${signingPayloadB64}`), key).toString("base64url");
  return new Headers({ "x-neon-signature": `${header}..${sig}`, "x-neon-signature-kid": "kulcs-1", "x-neon-timestamp": String(timestamp) });
}

describe("Neon webhook aláírás", () => {
  beforeEach(() => resetJwksCache());
  const body = JSON.stringify({ event_id: "e1", event_type: "send.otp", event_data: { otp_code: "123456" } });

  it("érvényes aláírást elfogad", async () => {
    const now = Date.now();
    await expect(verifyNeonWebhook(body, sign(body, now), fetchJwks, now)).resolves.toMatchObject({ event_id: "e1" });
  });
  it("módosított törzset elutasít", async () => {
    const now = Date.now();
    await expect(verifyNeonWebhook(body.replace("123456", "000000"), sign(body, now), fetchJwks, now)).rejects.toThrow("Érvénytelen aláírás");
  });
  it("idegen kulccsal aláírtat elutasít", async () => {
    const now = Date.now();
    const other = crypto.generateKeyPairSync("ed25519").privateKey;
    await expect(verifyNeonWebhook(body, sign(body, now, other), fetchJwks, now)).rejects.toThrow("Érvénytelen aláírás");
  });
  it("5 percnél régebbit elutasít", async () => {
    const now = Date.now();
    await expect(verifyNeonWebhook(body, sign(body, now - 6 * 60 * 1000), fetchJwks, now)).rejects.toThrow("időbélyeg");
  });
  it("hiányzó fejléceket elutasít", async () => {
    await expect(verifyNeonWebhook(body, new Headers(), fetchJwks)).rejects.toThrow("fejlécek");
  });
});
