import crypto from "crypto";
import "dotenv/config";

export interface BackendSessionPayload {
  iss: string;
  sub: string;
  aud: string;
  role: string;
  user_role: string;
  email: string;
  iat: number;
  exp: number;
  user_metadata: {
    full_name: string;
    name: string;
    email: string;
    phone_number: string;
    email_verified: boolean;
  };
}

const getSigningSecret = (): Buffer => {
  const secretSource =
    process.env.AUTH_SYNC_SECRET ||
    process.env.MAILJET_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "daurtani-auth-sync-key";
  return crypto.createHash("sha256").update(secretSource).digest();
};

const base64UrlEncode = (input: Buffer | string): string => {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

const base64UrlDecodeToString = (input: string): string => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
};

export const issueBackendSessionToken = (user: {
  _id?: any;
  id?: any;
  email: string;
  fullName?: string;
  phoneNumber?: string;
  role?: string;
}): { accessToken: string; refreshToken: string; expiresAt: number } => {
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = nowSec + 60 * 60 * 24 * 7; // 7 days
  const cleanEmail = String(user.email || "").trim().toLowerCase();
  const displayName =
    user.fullName || cleanEmail.split("@")[0] || "Pengguna DaurTani";

  const header = {
    alg: "HS256",
    typ: "JWT",
    kid: "daurtani-local-v1",
  };

  const payload: BackendSessionPayload = {
    iss: "daurtani-backend",
    sub: String(user._id || user.id || cleanEmail),
    aud: "authenticated",
    role: "authenticated",
    user_role: user.role || "user",
    email: cleanEmail,
    iat: nowSec,
    exp: expiresAt,
    user_metadata: {
      full_name: displayName,
      name: displayName,
      email: cleanEmail,
      phone_number: user.phoneNumber || "",
      email_verified: true,
    },
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(signingInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);

  const accessToken = `${signingInput}.${encodedSignature}`;
  const refreshToken = `dt_rt_${crypto.randomBytes(24).toString("hex")}`;

  return { accessToken, refreshToken, expiresAt };
};

export const verifyBackendSessionToken = (
  token?: string | null
): { valid: boolean; payload: BackendSessionPayload | null } => {
  if (!token || typeof token !== "string") {
    return { valid: false, payload: null };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, payload: null };
  }
  try {
    const headerJson = JSON.parse(base64UrlDecodeToString(parts[0]));
    const payloadJson = JSON.parse(
      base64UrlDecodeToString(parts[1])
    ) as BackendSessionPayload;

    if (
      headerJson?.kid !== "daurtani-local-v1" &&
      payloadJson?.iss !== "daurtani-backend"
    ) {
      return { valid: false, payload: null };
    }

    const signingInput = `${parts[0]}.${parts[1]}`;
    const expectedSig = base64UrlEncode(
      crypto
        .createHmac("sha256", getSigningSecret())
        .update(signingInput)
        .digest()
    );

    const actualBuf = Buffer.from(parts[2], "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    if (
      actualBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(actualBuf, expectedBuf)
    ) {
      return { valid: false, payload: null };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (!payloadJson.exp || payloadJson.exp <= nowSec) {
      return { valid: false, payload: null };
    }

    return { valid: true, payload: payloadJson };
  } catch {
    return { valid: false, payload: null };
  }
};

export const decodeJwtPayloadUnsafe = (
  token?: string | null
): Record<string, any> | null => {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecodeToString(parts[1]));
  } catch {
    return null;
  }
};

export const isJwtExpiredOrInvalid = (token?: string | null): boolean => {
  const payload = decodeJwtPayloadUnsafe(token);
  if (!payload || typeof payload.exp !== "number") return true;
  // Consider expired if less than 60 seconds remaining
  return payload.exp * 1000 <= Date.now() + 60_000;
};
