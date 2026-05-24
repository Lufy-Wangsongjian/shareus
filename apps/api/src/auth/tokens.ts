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
  const [encodedPayload, signature] = input.token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid token");
  }

  const expectedSignature = crypto
    .createHmac("sha256", input.secret)
    .update(encodedPayload)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("Invalid token");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
    role: string;
    exp: number;
  };

  if (payload.role !== "admin" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Invalid token");
  }

  return { role: "admin" };
}
