import crypto from "node:crypto";

export interface CreateAdminTokenInput {
  secret: string;
  ttlSec: number;
}

export async function createAdminToken(input: CreateAdminTokenInput): Promise<string> {
  const payload = {
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + input.ttlSec
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", input.secret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminToken(input: { token: string; secret: string }): Promise<{ role: "admin" }> {
  const parts = input.token.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid token");
  }

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    throw new Error("Invalid token");
  }

  const expectedSignature = crypto
    .createHmac("sha256", input.secret)
    .update(encodedPayload)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error("Invalid token");
  }

  let payload: { role: string; exp: number };
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      role: string;
      exp: number;
    };
  } catch {
    throw new Error("Invalid token");
  }

  if (payload.role !== "admin" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Invalid token");
  }

  return { role: "admin" };
}
