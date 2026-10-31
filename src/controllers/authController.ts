import { Request, Response } from "express";
import crypto from "crypto";
import response from "../libs/utils/responses";
import supabase, { createScopedSupabaseClient } from "../libs/supabase/client";
import { IUser, User } from "../models/userModel";
import {
  sendActivationMagicLinkEmail,
  sendPasswordResetEmail,
} from "../libs/utils/mailjetService";
import {
  issueBackendSessionToken,
  isJwtExpiredOrInvalid,
} from "../libs/utils/sessionToken";
import "dotenv/config";

type AuthActionHint =
  | "LOGIN"
  | "REGISTER"
  | "RETRY"
  | "CHECK_EMAIL"
  | "RESEND_ACTIVATION"
  | "REQUEST_NEW_RESET";

interface StructuredAuthError {
  httpCode: number;
  errorCode: string;
  title: string;
  message: string;
  actionHint?: AuthActionHint;
  cooldownSeconds?: number;
}

const COOLDOWN_SECONDS = 60;
const COOLDOWN_GUARD_MS = 55 * 1000;
const ACTIVATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_PASSWORD_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

const sendStructuredAuthError = (
  res: Response,
  errInfo: StructuredAuthError
): void => {
  response.sendError(res, errInfo.httpCode, {
    status: "ERROR",
    message: errInfo.message,
    data: {
      errorCode: errInfo.errorCode,
      title: errInfo.title,
      detail: errInfo.message,
      actionHint: errInfo.actionHint,
      cooldownSeconds: errInfo.cooldownSeconds,
    },
  });
};

const generateSecureToken = (): string =>
  crypto.randomBytes(32).toString("hex");

const hashToken = (rawToken: string): string =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

const getEncryptionKey = (): Buffer => {
  const secretSource =
    process.env.MAILJET_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "daurtani-auth-sync-key";
  return crypto.createHash("sha256").update(secretSource).digest();
};

const encryptSyncSecret = (plainText: string): string => {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString(
    "hex"
  )}`;
};

const decryptSyncSecret = (cipherText?: string | null): string | null => {
  if (!cipherText) return null;
  try {
    const parts = cipherText.split(":");
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = Buffer.from(parts[2], "hex");
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
};

const getFrontendBaseUrl = (req: Request): string => {
  const origin = String(req.headers.origin || "")
    .trim()
    .replace(/\/+$/, "");
  if (
    origin &&
    (origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin.includes("daurtani.id") ||
      origin.includes("vercel.app"))
  ) {
    return origin;
  }
  if (process.env.REDIRECT_OAUTH_URL) {
    try {
      const parsed = new URL(process.env.REDIRECT_OAUTH_URL);
      return parsed.origin;
    } catch {
      // ignore invalid URL
    }
  }
  return (process.env.PUBLIC_SITE_URL || "https://www.daurtani.id").replace(
    /\/+$/,
    ""
  );
};

const getCallbackUrl = (req: Request): string => {
  const origin = String(req.headers.origin || "")
    .trim()
    .replace(/\/+$/, "");
  if (
    origin &&
    (origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin.includes("daurtani.id") ||
      origin.includes("vercel.app"))
  ) {
    return `${origin}/auth/callback`;
  }
  return (
    process.env.REDIRECT_OAUTH_URL ||
    `${getFrontendBaseUrl(req)}/auth/callback`
  );
};

const obtainUserSupabaseSession = async (
  user: IUser | any,
  knownPassword?: string
): Promise<{
  scopedClient: ReturnType<typeof createScopedSupabaseClient>;
  accessToken: string | null;
  refreshToken: string | null;
  syncedPassword: string | null;
}> => {
  const scopedClient = createScopedSupabaseClient();
  const candidatePassword =
    knownPassword || decryptSyncSecret(user?.authSyncCipher);

  // 1. Try signing in with synced password for a guaranteed fresh session
  if (candidatePassword && user?.email) {
    const { data, error } = await scopedClient.auth.signInWithPassword({
      email: user.email,
      password: candidatePassword,
    });
    if (!error && data?.session) {
      return {
        scopedClient,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        syncedPassword: candidatePassword,
      };
    }
  }

  // 2. Fallback: refresh or set existing tokens from MongoDB
  if (user?.refreshToken) {
    const { data: refreshed, error: refreshErr } =
      await scopedClient.auth.refreshSession({
        refresh_token: user.refreshToken,
      });
    if (!refreshErr && refreshed?.session) {
      return {
        scopedClient,
        accessToken: refreshed.session.access_token,
        refreshToken: refreshed.session.refresh_token,
        syncedPassword: candidatePassword,
      };
    }

    if (user?.accessToken) {
      const { data: setRes, error: setErr } =
        await scopedClient.auth.setSession({
          access_token: user.accessToken,
          refresh_token: user.refreshToken,
        });
      if (!setErr && setRes?.session) {
        return {
          scopedClient,
          accessToken: setRes.session.access_token,
          refreshToken: setRes.session.refresh_token,
          syncedPassword: candidatePassword,
        };
      }
    }
  }

  return {
    scopedClient,
    accessToken: user?.accessToken || null,
    refreshToken: user?.refreshToken || null,
    syncedPassword: candidatePassword,
  };
};

const sanitizeUserPayload = (userDoc: any) => {
  const obj =
    typeof userDoc?.toObject === "function" ? userDoc.toObject() : { ...userDoc };
  delete obj.activationTokenHash;
  delete obj.activationTokenExpiresAt;
  delete obj.activationLastSentAt;
  delete obj.resetPasswordTokenHash;
  delete obj.resetPasswordExpiresAt;
  delete obj.resetPasswordLastSentAt;
  delete obj.authSyncCipher;
  return obj;
};

const mapAuthError = (
  err: any,
  context: "login" | "register" | "forgot" | "reset",
  emailExistsInDb?: boolean
): StructuredAuthError => {
  const code = String(err?.code || "").toLowerCase();
  const rawMessage = String(err?.message || "").toLowerCase();
  const status = Number(err?.status) || 500;

  if (
    code === "11000" ||
    err?.code === 11000 ||
    code === "user_already_exists" ||
    code === "email_exists" ||
    rawMessage.includes("already registered") ||
    rawMessage.includes("already been registered") ||
    rawMessage.includes("duplicate key")
  ) {
    return {
      httpCode: 409,
      errorCode: "EMAIL_ALREADY_REGISTERED",
      title: "Email Sudah Terdaftar",
      message:
        "Alamat email ini sudah terdaftar dan aktif di sistem DaurTani. Silakan masuk menggunakan akun Anda yang sudah ada, atau gunakan alamat email lain untuk mendaftar baru.",
      actionHint: "LOGIN",
    };
  }

  if (
    code === "same_password" ||
    rawMessage.includes("different from the old password") ||
    rawMessage.includes("same_password")
  ) {
    return {
      httpCode: 422,
      errorCode: "SAME_PASSWORD",
      title: "Kata Sandi Tidak Boleh Sama",
      message:
        "Kata sandi baru yang Anda masukkan sama dengan kata sandi lama. Silakan gunakan kombinasi kata sandi yang berbeda.",
      actionHint: "RETRY",
    };
  }

  if (
    code === "weak_password" ||
    rawMessage.includes("password should be at least") ||
    rawMessage.includes("weak password")
  ) {
    return {
      httpCode: 422,
      errorCode: "WEAK_PASSWORD",
      title: "Kata Sandi Terlalu Lemah",
      message:
        "Kata sandi minimal harus terdiri dari 6 karakter. Gunakan kombinasi huruf dan angka agar akun Anda lebih aman.",
      actionHint: "RETRY",
    };
  }

  if (
    code === "invalid_credentials" ||
    rawMessage.includes("invalid login credentials")
  ) {
    if (emailExistsInDb === false) {
      return {
        httpCode: 404,
        errorCode: "ACCOUNT_NOT_FOUND",
        title: "Akun Belum Terdaftar",
        message:
          "Alamat email yang Anda masukkan belum terdaftar di DaurTani. Periksa kembali ejaan email Anda atau silakan daftar akun baru terlebih dahulu.",
        actionHint: "REGISTER",
      };
    }
    return {
      httpCode: 401,
      errorCode: "WRONG_PASSWORD",
      title: "Kata Sandi Belum Sesuai",
      message:
        "Email Anda terdaftar, namun kata sandi yang dimasukkan belum sesuai. Pastikan huruf besar/kecil sudah benar, atau klik 'Lupa kata sandi?' untuk mengatur ulang kata sandi Anda.",
      actionHint: "RETRY",
    };
  }

  if (
    code === "email_not_confirmed" ||
    rawMessage.includes("email not confirmed")
  ) {
    return {
      httpCode: 403,
      errorCode: "EMAIL_NOT_CONFIRMED",
      title: "Akun Belum Diaktivasi",
      message:
        "Akun Anda sudah terdaftar namun belum diaktivasi. Silakan periksa kotak masuk atau folder Spam email Anda dan klik tautan aktivasi (Magic Link), atau kirim ulang tautan aktivasi.",
      actionHint: "CHECK_EMAIL",
    };
  }

  if (
    code === "email_address_invalid" ||
    code === "validation_failed" ||
    rawMessage.includes("invalid email") ||
    rawMessage.includes("unable to validate email")
  ) {
    return {
      httpCode: 400,
      errorCode: "INVALID_EMAIL",
      title: "Format Email Tidak Valid",
      message:
        "Format alamat email yang dimasukkan tidak valid. Pastikan penulisan email sudah benar (contoh: nama@email.com).",
      actionHint: "RETRY",
    };
  }

  if (rawMessage.includes("mailjet")) {
    return {
      httpCode: 502,
      errorCode: "EMAIL_DELIVERY_FAILED",
      title: "Gagal Mengirim Email",
      message:
        "Layanan pengiriman email sedang mengalami gangguan sesaat. Silakan klik tombol kirim ulang beberapa saat lagi.",
      actionHint: "RETRY",
    };
  }

  if (
    status === 429 ||
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    rawMessage.includes("rate limit") ||
    rawMessage.includes("too many requests") ||
    rawMessage.includes("for security purposes, you can only request this")
  ) {
    return {
      httpCode: 429,
      errorCode: "RATE_LIMIT_EXCEEDED",
      title: "Terlalu Banyak Permintaan",
      message:
        "Sistem mendeteksi terlalu banyak permintaan dalam waktu singkat. Demi keamanan akun Anda, silakan tunggu sekitar 1 menit sebelum mencoba kembali.",
      actionHint: "RETRY",
      cooldownSeconds: COOLDOWN_SECONDS,
    };
  }

  return {
    httpCode: status >= 400 && status < 600 ? status : 500,
    errorCode:
      context === "register"
        ? "REGISTER_FAILED"
        : context === "forgot"
        ? "FORGOT_PASSWORD_FAILED"
        : context === "reset"
        ? "RESET_PASSWORD_FAILED"
        : "LOGIN_FAILED",
    title:
      context === "register"
        ? "Kendala Saat Mendaftarkan Akun"
        : context === "forgot"
        ? "Kendala Saat Mengirim Tautan Pemulihan"
        : context === "reset"
        ? "Kendala Saat Memperbarui Kata Sandi"
        : "Kendala Saat Masuk ke Akun",
    message:
      context === "register"
        ? "Maaf, sistem sedang mengalami kendala saat memproses pendaftaran akun Anda. Silakan periksa kembali data yang diisi atau coba lagi beberapa saat."
        : context === "forgot"
        ? "Maaf, sistem belum dapat mengirimkan tautan pemulihan kata sandi saat ini. Silakan coba lagi beberapa saat."
        : context === "reset"
        ? "Maaf, terjadi kendala saat menyimpan kata sandi baru Anda. Silakan coba kembali."
        : "Maaf, sistem sedang mengalami kendala saat memverifikasi sesi masuk Anda. Silakan coba lagi beberapa saat.",
    actionHint: "RETRY",
  };
};

const loginOAuth = async (req: Request, res: Response): Promise<void> => {
  const redirectTo = getCallbackUrl(req);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) {
    console.error("Login OAuth error:", error);
    return sendStructuredAuthError(res, {
      httpCode: 500,
      errorCode: "OAUTH_INIT_FAILED",
      title: "Gagal Menghubungkan ke Google",
      message:
        "Tidak dapat memulai proses masuk dengan Google saat ini. Silakan coba lagi atau masuk menggunakan email dan kata sandi.",
      actionHint: "RETRY",
    });
  }

  return response.sendSuccess(res, { data });
};

const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawEmail = req.body?.email;
    const password = req.body?.password;

    if (!rawEmail || !password) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "MISSING_CREDENTIALS",
        title: "Data Masuk Belum Lengkap",
        message:
          "Mohon isi alamat email beserta kata sandi Anda terlebih dahulu sebelum melanjutkan.",
        actionHint: "RETRY",
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "INVALID_EMAIL",
        title: "Format Email Tidak Valid",
        message:
          "Format alamat email yang Anda masukkan belum benar. Gunakan format email standar seperti nama@email.com.",
        actionHint: "RETRY",
      });
    }

    const existingDbUser = await User.findOne({ email }).lean();

    // Check if account exists in MongoDB and has NOT activated email via Magic Link yet
    if (existingDbUser && existingDbUser.isEmailVerified === false) {
      return sendStructuredAuthError(res, {
        httpCode: 403,
        errorCode: "EMAIL_NOT_CONFIRMED",
        title: "Akun Belum Diaktivasi",
        message: `Akun untuk "${email}" sudah terdaftar namun belum diaktivasi. Silakan periksa kotak masuk atau folder Spam email Anda untuk mengklik tautan aktivasi (Magic Link), atau klik tombol di bawah untuk mengirim ulang tautan aktivasi.`,
        actionHint: "CHECK_EMAIL",
      });
    }

    const scopedClient = createScopedSupabaseClient();
    const { data: authUser, error } =
      await scopedClient.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      // Fallback check: if password was recently reset and synced in MongoDB while legacy Supabase session was revoked
      const syncedPassword = decryptSyncSecret(existingDbUser?.authSyncCipher);
      if (
        existingDbUser &&
        syncedPassword &&
        syncedPassword === String(password)
      ) {
        let validAccessToken = existingDbUser.accessToken || "";
        let validRefreshToken = existingDbUser.refreshToken || "";

        // Attempt to heal Supabase password & obtain fresh session if a refresh token is still alive
        try {
          const {
            scopedClient: healClient,
            accessToken: healedAccess,
            refreshToken: healedRefresh,
          } = await obtainUserSupabaseSession(existingDbUser);

          if (healedAccess) {
            await healClient.auth.updateUser({ password: String(password) });
            const { data: reSign } =
              await healClient.auth.signInWithPassword({
                email,
                password: String(password),
              });
            if (reSign?.session) {
              validAccessToken = reSign.session.access_token;
              validRefreshToken = reSign.session.refresh_token;
            } else {
              validAccessToken = healedAccess;
              validRefreshToken = healedRefresh || validRefreshToken;
            }
          }
        } catch {
          // Ignore heal errors; fallback session token below guarantees a valid token
        }

        // If stored token is expired or invalid, mint a valid 7-day DaurTani backend session token
        if (isJwtExpiredOrInvalid(validAccessToken)) {
          const issued = issueBackendSessionToken(existingDbUser);
          validAccessToken = issued.accessToken;
          validRefreshToken = issued.refreshToken;
        }

        const updatedFallbackUser = await User.findOneAndUpdate(
          { email },
          {
            $set: {
              accessToken: validAccessToken,
              refreshToken: validRefreshToken,
              isEmailVerified: true,
              updatedAt: new Date(),
            },
          },
          { new: true }
        );

        return response.sendSuccess(res, {
          data: sanitizeUserPayload(updatedFallbackUser || existingDbUser),
        });
      }

      console.error("Login error:", error);
      return sendStructuredAuthError(
        res,
        mapAuthError(error, "login", Boolean(existingDbUser))
      );
    }

    if (!authUser?.session) {
      return sendStructuredAuthError(res, {
        httpCode: 403,
        errorCode: "EMAIL_NOT_CONFIRMED",
        title: "Akun Belum Diaktivasi",
        message:
          "Akun Anda memerlukan verifikasi email sebelum dapat digunakan. Silakan periksa kotak masuk atau folder Spam email Anda.",
        actionHint: "CHECK_EMAIL",
      });
    }

    const fallbackFullName =
      authUser.user?.user_metadata?.full_name ||
      existingDbUser?.fullName ||
      email.split("@")[0];
    const fallbackPhone =
      authUser.user?.user_metadata?.phone_number ||
      existingDbUser?.phoneNumber ||
      "";

    const user = await User.findOneAndUpdate(
      { email },
      {
        $set: {
          accessToken: authUser.session.access_token,
          refreshToken: authUser.session.refresh_token,
          isEmailVerified: true,
          authSyncCipher: encryptSyncSecret(String(password)),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          fullName: fallbackFullName,
          phoneNumber: fallbackPhone,
          email,
          role: "user",
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        projection: {
          email: 1,
          phoneNumber: 1,
          fullName: 1,
          role: 1,
          isEmailVerified: 1,
          accessToken: 1,
          refreshToken: 1,
          _id: 1,
        },
      }
    );

    return response.sendSuccess(res, { data: user });
  } catch (err: any) {
    console.error("Login error:", err);
    return sendStructuredAuthError(res, mapAuthError(err, "login"));
  }
};

const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawFullName = req.body?.fullName;
    const rawEmail = req.body?.email;
    const password = req.body?.password;
    const rawPhoneNumber = req.body?.phoneNumber;

    if (!rawFullName || !rawEmail || !password || !rawPhoneNumber) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "MISSING_FIELDS",
        title: "Data Pendaftaran Belum Lengkap",
        message:
          "Mohon lengkapi seluruh kolom wajib (Nama Lengkap, Email, Kata Sandi, dan Nomor Telepon) untuk membuat akun.",
        actionHint: "RETRY",
      });
    }

    const fullName = String(rawFullName).trim();
    const email = String(rawEmail).trim().toLowerCase();
    const phoneNumber = String(rawPhoneNumber).trim();

    if (fullName.length < 2) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "INVALID_FULLNAME",
        title: "Nama Lengkap Terlalu Pendek",
        message: "Mohon masukkan nama lengkap Anda minimal 2 karakter.",
        actionHint: "RETRY",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "INVALID_EMAIL",
        title: "Format Email Tidak Valid",
        message:
          "Format alamat email tidak valid. Pastikan penulisan email sudah benar (contoh: nama@email.com).",
        actionHint: "RETRY",
      });
    }

    if (String(password).length < 6) {
      return sendStructuredAuthError(res, {
        httpCode: 422,
        errorCode: "WEAK_PASSWORD",
        title: "Kata Sandi Terlalu Pendek",
        message:
          "Kata sandi minimal harus terdiri dari 6 karakter. Gunakan kombinasi huruf dan angka agar akun Anda aman.",
        actionHint: "RETRY",
      });
    }

    const callbackUrl = getCallbackUrl(req);
    const existingUser = await User.findOne({ email });

    // CASE 1: Email already exists in MongoDB
    if (existingUser) {
      // Sub-case 1A: User registered previously via email, but has NOT activated via Magic Link yet!
      if (existingUser.isEmailVerified === false) {
        // Sync updated password & profile metadata into Supabase Auth if session is available
        try {
          const { scopedClient, accessToken } = await obtainUserSupabaseSession(
            existingUser
          );
          if (accessToken) {
            const { data: updatedAuth } = await scopedClient.auth.updateUser({
              password: String(password),
              data: {
                full_name: fullName,
                phone_number: phoneNumber,
              },
            });
            if (updatedAuth?.user) {
              const { data: reSign } =
                await scopedClient.auth.signInWithPassword({
                  email,
                  password: String(password),
                });
              if (reSign?.session) {
                existingUser.accessToken = reSign.session.access_token;
                existingUser.refreshToken = reSign.session.refresh_token;
              }
            }
          }
        } catch (syncErr) {
          console.warn(
            "Non-fatal sync warning on unverified re-register:",
            syncErr
          );
        }

        const now = Date.now();
        const lastSentMs = existingUser.activationLastSentAt
          ? new Date(existingUser.activationLastSentAt).getTime()
          : 0;
        const elapsedMs = now - lastSentMs;

        // If an email was already sent less than 55s ago, do not spam Mailjet—transition user smoothly to activation screen with remaining cooldown
        if (
          lastSentMs > 0 &&
          elapsedMs < COOLDOWN_GUARD_MS &&
          existingUser.activationTokenHash
        ) {
          const remainingCooldown = Math.max(
            5,
            Math.ceil((COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000)
          );
          existingUser.fullName = fullName;
          existingUser.phoneNumber = phoneNumber;
          existingUser.authSyncCipher = encryptSyncSecret(String(password));
          existingUser.updatedAt = new Date();
          await existingUser.save();

          return response.sendSuccess(res, {
            message: `Alamat email "${email}" sudah terdaftar dan menunggu aktivasi. Tautan aktivasi (Magic Link) telah dikirimkan baru-baru ini—silakan periksa kotak masuk atau folder Spam Anda.`,
            data: {
              email,
              fullName,
              phoneNumber,
              requiresEmailConfirmation: true,
              isResend: true,
              cooldownSeconds: remainingCooldown,
            },
          });
        }

        // Generate a fresh Magic Link token and send via Mailjet
        const rawActivationToken = generateSecureToken();
        const tokenHash = hashToken(rawActivationToken);
        const expiresAt = new Date(now + ACTIVATION_EXPIRY_MS);
        const magicLinkUrl = `${callbackUrl}?type=signup&token=${rawActivationToken}&email=${encodeURIComponent(
          email
        )}`;

        await sendActivationMagicLinkEmail({
          toEmail: email,
          fullName,
          magicLinkUrl,
        });

        existingUser.fullName = fullName;
        existingUser.phoneNumber = phoneNumber;
        existingUser.activationTokenHash = tokenHash;
        existingUser.activationTokenExpiresAt = expiresAt;
        existingUser.activationLastSentAt = new Date(now);
        existingUser.authSyncCipher = encryptSyncSecret(String(password));
        existingUser.updatedAt = new Date(now);
        await existingUser.save();

        return response.sendSuccess(res, {
          message: `Alamat email "${email}" sudah terdaftar namun belum diaktivasi. Kami baru saja mengirimkan ulang tautan aktivasi (Magic Link) terbaru ke email Anda.`,
          data: {
            email,
            fullName,
            phoneNumber,
            requiresEmailConfirmation: true,
            isResend: true,
            cooldownSeconds: COOLDOWN_SECONDS,
          },
        });
      }

      // Sub-case 1B: User is already verified & active
      return sendStructuredAuthError(res, {
        httpCode: 409,
        errorCode: "EMAIL_ALREADY_REGISTERED",
        title: "Email Sudah Terdaftar",
        message: `Alamat email "${email}" sudah terdaftar dan aktif di DaurTani. Silakan masuk menggunakan akun Anda, atau gunakan alamat email lain jika ingin membuat akun baru.`,
        actionHint: "LOGIN",
      });
    }

    // CASE 2: Brand new user registration
    const scopedClient = createScopedSupabaseClient();
    const { data: registUser, error } = await scopedClient.auth.signUp({
      email,
      password: String(password),
      options: {
        emailRedirectTo: `${callbackUrl}?type=signup`,
        data: {
          full_name: fullName,
          phone_number: phoneNumber,
        },
      },
    });

    if (error) {
      console.error("Register error:", error.message);
      return sendStructuredAuthError(res, mapAuthError(error, "register"));
    }

    if (
      registUser?.user &&
      Array.isArray(registUser.user.identities) &&
      registUser.user.identities.length === 0
    ) {
      return sendStructuredAuthError(res, {
        httpCode: 409,
        errorCode: "EMAIL_ALREADY_REGISTERED",
        title: "Email Sudah Terdaftar",
        message: `Alamat email "${email}" sudah pernah didaftarkan sebelumnya. Silakan masuk ke akun Anda.`,
        actionHint: "LOGIN",
      });
    }

    const now = Date.now();
    const rawActivationToken = generateSecureToken();
    const tokenHash = hashToken(rawActivationToken);
    const expiresAt = new Date(now + ACTIVATION_EXPIRY_MS);
    const magicLinkUrl = `${callbackUrl}?type=signup&token=${rawActivationToken}&email=${encodeURIComponent(
      email
    )}`;

    await sendActivationMagicLinkEmail({
      toEmail: email,
      fullName,
      magicLinkUrl,
    });

    const createdUser = await User.create({
      fullName,
      email,
      phoneNumber,
      isEmailVerified: false,
      activationTokenHash: tokenHash,
      activationTokenExpiresAt: expiresAt,
      activationLastSentAt: new Date(now),
      authSyncCipher: encryptSyncSecret(String(password)),
      accessToken: registUser.session?.access_token,
      refreshToken: registUser.session?.refresh_token,
    });

    return response.sendCreated(res, {
      message:
        "Pendaftaran berhasil! Kami telah mengirimkan tautan aktivasi (Magic Link) ke alamat email Anda. Silakan periksa kotak masuk atau folder Spam untuk mengaktifkan akun.",
      data: {
        _id: createdUser._id,
        email: createdUser.email,
        fullName: createdUser.fullName,
        phoneNumber: createdUser.phoneNumber,
        requiresEmailConfirmation: true,
        isResend: false,
        cooldownSeconds: COOLDOWN_SECONDS,
      },
    });
  } catch (err: any) {
    console.error("Unexpected register error:", err);
    return sendStructuredAuthError(res, mapAuthError(err, "register"));
  }
};

const resendActivation = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawEmail = req.body?.email;
    if (!rawEmail) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "MISSING_EMAIL",
        title: "Alamat Email Belum Diisi",
        message:
          "Mohon masukkan alamat email yang ingin dikirimkan ulang tautan aktivasinya.",
        actionHint: "RETRY",
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "INVALID_EMAIL",
        title: "Format Email Tidak Valid",
        message:
          "Format alamat email tidak valid. Pastikan penulisan email sudah benar (contoh: nama@email.com).",
        actionHint: "RETRY",
      });
    }

    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return sendStructuredAuthError(res, {
        httpCode: 404,
        errorCode: "ACCOUNT_NOT_FOUND",
        title: "Email Belum Terdaftar",
        message: `Alamat email "${email}" belum terdaftar di DaurTani. Silakan lakukan pendaftaran akun terlebih dahulu.`,
        actionHint: "REGISTER",
      });
    }

    if (existingUser.isEmailVerified !== false) {
      return sendStructuredAuthError(res, {
        httpCode: 409,
        errorCode: "ALREADY_VERIFIED",
        title: "Akun Sudah Aktif",
        message: `Akun dengan alamat email "${email}" sudah terverifikasi dan aktif. Silakan langsung masuk ke akun Anda.`,
        actionHint: "LOGIN",
      });
    }

    const now = Date.now();
    const lastSentMs = existingUser.activationLastSentAt
      ? new Date(existingUser.activationLastSentAt).getTime()
      : 0;
    const elapsedMs = now - lastSentMs;

    if (lastSentMs > 0 && elapsedMs < COOLDOWN_GUARD_MS) {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000)
      );
      return sendStructuredAuthError(res, {
        httpCode: 429,
        errorCode: "RATE_LIMIT_EXCEEDED",
        title: "Mohon Tunggu Sebentar",
        message: `Tautan aktivasi baru saja dikirimkan. Demi keamanan, silakan tunggu ${remainingSeconds} detik lagi sebelum mengirim ulang.`,
        actionHint: "RETRY",
        cooldownSeconds: remainingSeconds,
      });
    }

    const callbackUrl = getCallbackUrl(req);
    const rawActivationToken = generateSecureToken();
    const tokenHash = hashToken(rawActivationToken);
    const expiresAt = new Date(now + ACTIVATION_EXPIRY_MS);
    const magicLinkUrl = `${callbackUrl}?type=signup&token=${rawActivationToken}&email=${encodeURIComponent(
      email
    )}`;

    await sendActivationMagicLinkEmail({
      toEmail: email,
      fullName: existingUser.fullName,
      magicLinkUrl,
    });

    existingUser.activationTokenHash = tokenHash;
    existingUser.activationTokenExpiresAt = expiresAt;
    existingUser.activationLastSentAt = new Date(now);
    existingUser.updatedAt = new Date(now);
    await existingUser.save();

    return response.sendSuccess(res, {
      message: `Tautan aktivasi (Magic Link) baru telah berhasil dikirimkan ke ${email}. Silakan periksa kotak masuk atau folder Spam Anda.`,
      data: {
        email,
        cooldownSeconds: COOLDOWN_SECONDS,
      },
    });
  } catch (err: any) {
    console.error("Resend activation error:", err);
    return sendStructuredAuthError(res, mapAuthError(err, "register"));
  }
};

const verifyActivation = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawEmail = req.body?.email;
    const rawToken = req.body?.token;

    if (!rawEmail || !rawToken) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "INVALID_ACTIVATION_LINK",
        title: "Tautan Aktivasi Tidak Lengkap",
        message:
          "Parameter tautan aktivasi tidak lengkap atau rusak. Silakan minta pengiriman ulang tautan aktivasi baru.",
        actionHint: "RESEND_ACTIVATION",
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const token = String(rawToken).trim();
    const user = await User.findOne({ email });

    if (!user) {
      return sendStructuredAuthError(res, {
        httpCode: 404,
        errorCode: "ACCOUNT_NOT_FOUND",
        title: "Akun Tidak Ditemukan",
        message:
          "Akun yang terkait dengan tautan aktivasi ini tidak ditemukan. Silakan daftar kembali.",
        actionHint: "REGISTER",
      });
    }

    // If user already verified previously and token was cleared
    if (!user.activationTokenHash && user.isEmailVerified === true) {
      const { accessToken, refreshToken } = await obtainUserSupabaseSession(
        user
      );
      if (accessToken) {
        user.accessToken = accessToken;
        if (refreshToken) user.refreshToken = refreshToken;
        await user.save();
        return response.sendSuccess(res, {
          message: "Akun Anda sudah aktif.",
          data: sanitizeUserPayload(user),
        });
      }
      return sendStructuredAuthError(res, {
        httpCode: 409,
        errorCode: "ALREADY_VERIFIED",
        title: "Akun Sudah Diaktivasi",
        message:
          "Akun Anda sudah berhasil diaktivasi sebelumnya. Silakan masuk menggunakan email dan kata sandi Anda.",
        actionHint: "LOGIN",
      });
    }

    const incomingHash = hashToken(token);
    if (!user.activationTokenHash || incomingHash !== user.activationTokenHash) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "INVALID_ACTIVATION_LINK",
        title: "Tautan Aktivasi Tidak Valid",
        message:
          "Tautan aktivasi ini sudah tidak berlaku karena Anda mungkin telah meminta tautan aktivasi yang lebih baru. Silakan gunakan email terbaru atau kirim ulang tautan aktivasi.",
        actionHint: "RESEND_ACTIVATION",
      });
    }

    if (
      !user.activationTokenExpiresAt ||
      new Date(user.activationTokenExpiresAt).getTime() < Date.now()
    ) {
      return sendStructuredAuthError(res, {
        httpCode: 410,
        errorCode: "ACTIVATION_LINK_EXPIRED",
        title: "Tautan Aktivasi Sudah Kedaluwarsa",
        message:
          "Batas waktu 24 jam untuk tautan aktivasi ini telah berakhir. Silakan klik tombol di bawah untuk menerima tautan aktivasi baru.",
        actionHint: "RESEND_ACTIVATION",
      });
    }

    const { accessToken, refreshToken } = await obtainUserSupabaseSession(user);

    user.isEmailVerified = true;
    user.activationTokenHash = null;
    user.activationTokenExpiresAt = null;
    if (accessToken) {
      user.accessToken = accessToken;
      if (refreshToken) user.refreshToken = refreshToken;
    } else if (isJwtExpiredOrInvalid(user.accessToken)) {
      const issued = issueBackendSessionToken(user);
      user.accessToken = issued.accessToken;
      user.refreshToken = issued.refreshToken;
    }
    user.updatedAt = new Date();
    await user.save();

    return response.sendSuccess(res, {
      message: "Akun berhasil diaktivasi! Selamat datang di DaurTani.",
      data: sanitizeUserPayload(user),
    });
  } catch (err: any) {
    console.error("Verify activation error:", err);
    return sendStructuredAuthError(res, {
      httpCode: 500,
      errorCode: "ACTIVATION_VERIFY_FAILED",
      title: "Gagal Memverifikasi Aktivasi Akun",
      message:
        "Terjadi kendala saat mengaktifkan akun Anda. Silakan coba muat ulang halaman atau minta tautan aktivasi baru.",
      actionHint: "RESEND_ACTIVATION",
    });
  }
};

const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawEmail = req.body?.email;
    if (!rawEmail) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "MISSING_EMAIL",
        title: "Alamat Email Belum Diisi",
        message:
          "Mohon masukkan alamat email yang terdaftar pada akun DaurTani Anda.",
        actionHint: "RETRY",
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "INVALID_EMAIL",
        title: "Format Email Tidak Valid",
        message:
          "Format alamat email yang dimasukkan belum benar. Gunakan format standar seperti nama@email.com.",
        actionHint: "RETRY",
      });
    }

    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return sendStructuredAuthError(res, {
        httpCode: 404,
        errorCode: "ACCOUNT_NOT_FOUND",
        title: "Akun Belum Terdaftar",
        message: `Alamat email "${email}" belum terdaftar di sistem DaurTani. Periksa kembali penulisan email Anda atau silakan daftar akun baru.`,
        actionHint: "REGISTER",
      });
    }

    const now = Date.now();
    const lastSentMs = existingUser.resetPasswordLastSentAt
      ? new Date(existingUser.resetPasswordLastSentAt).getTime()
      : 0;
    const elapsedMs = now - lastSentMs;

    if (lastSentMs > 0 && elapsedMs < COOLDOWN_GUARD_MS) {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000)
      );
      return sendStructuredAuthError(res, {
        httpCode: 429,
        errorCode: "RATE_LIMIT_EXCEEDED",
        title: "Mohon Tunggu Sebentar",
        message: `Tautan pemulihan kata sandi baru saja dikirimkan. Silakan tunggu ${remainingSeconds} detik lagi sebelum meminta pengiriman ulang.`,
        actionHint: "RETRY",
        cooldownSeconds: remainingSeconds,
      });
    }

    const frontendBaseUrl = getFrontendBaseUrl(req);
    const rawResetToken = generateSecureToken();
    const tokenHash = hashToken(rawResetToken);
    const expiresAt = new Date(now + RESET_PASSWORD_EXPIRY_MS);
    const resetLinkUrl = `${frontendBaseUrl}/auth/reset-password?token=${rawResetToken}&email=${encodeURIComponent(
      email
    )}`;

    await sendPasswordResetEmail({
      toEmail: email,
      fullName: existingUser.fullName,
      resetLinkUrl,
    });

    existingUser.resetPasswordTokenHash = tokenHash;
    existingUser.resetPasswordExpiresAt = expiresAt;
    existingUser.resetPasswordLastSentAt = new Date(now);
    existingUser.updatedAt = new Date(now);
    await existingUser.save();

    return response.sendSuccess(res, {
      message: `Tautan pengaturan ulang kata sandi telah dikirim ke ${email}. Silakan periksa kotak masuk atau folder Spam Anda.`,
      data: {
        email,
        cooldownSeconds: COOLDOWN_SECONDS,
      },
    });
  } catch (err: any) {
    console.error("Forgot password error:", err);
    return sendStructuredAuthError(res, mapAuthError(err, "forgot"));
  }
};

const verifyResetToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawEmail = req.body?.email;
    const rawToken = req.body?.token;

    if (!rawEmail || !rawToken) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "INVALID_RECOVERY_LINK",
        title: "Tautan Pemulihan Tidak Lengkap",
        message:
          "Tautan pengaturan ulang kata sandi tidak lengkap atau rusak. Silakan minta tautan pemulihan baru.",
        actionHint: "REQUEST_NEW_RESET",
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const token = String(rawToken).trim();
    const user = await User.findOne({ email }).lean();

    if (!user || !user.resetPasswordTokenHash) {
      return sendStructuredAuthError(res, {
        httpCode: 410,
        errorCode: "RECOVERY_LINK_EXPIRED",
        title: "Tautan Sudah Tidak Berlaku",
        message:
          "Tautan pemulihan kata sandi ini sudah pernah digunakan atau tidak ditemukan. Demi keamanan, setiap tautan hanya berlaku satu kali.",
        actionHint: "REQUEST_NEW_RESET",
      });
    }

    if (hashToken(token) !== user.resetPasswordTokenHash) {
      return sendStructuredAuthError(res, {
        httpCode: 400,
        errorCode: "INVALID_RECOVERY_LINK",
        title: "Tautan Pemulihan Tidak Valid",
        message:
          "Tautan ini sudah digantikan oleh permintaan pemulihan kata sandi yang lebih baru. Silakan buka email terbaru dari DaurTani atau minta tautan baru.",
        actionHint: "REQUEST_NEW_RESET",
      });
    }

    if (
      !user.resetPasswordExpiresAt ||
      new Date(user.resetPasswordExpiresAt).getTime() < Date.now()
    ) {
      return sendStructuredAuthError(res, {
        httpCode: 410,
        errorCode: "RECOVERY_LINK_EXPIRED",
        title: "Tautan Pemulihan Sudah Kedaluwarsa",
        message:
          "Batas waktu 30 menit untuk tautan pemulihan kata sandi ini telah berakhir. Silakan minta pengiriman tautan pemulihan yang baru.",
        actionHint: "REQUEST_NEW_RESET",
      });
    }

    return response.sendSuccess(res, {
      message: "Tautan pemulihan valid.",
      data: {
        email: user.email,
        fullName: user.fullName,
      },
    });
  } catch (err: any) {
    console.error("Verify reset token error:", err);
    return sendStructuredAuthError(res, mapAuthError(err, "reset"));
  }
};

const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawEmail = req.body?.email;
    const rawToken = req.body?.token;
    const newPassword = req.body?.newPassword;
    const fallbackAccessToken = req.body?.accessToken;
    const fallbackRefreshToken = req.body?.refreshToken;

    if (!newPassword || String(newPassword).length < 6) {
      return sendStructuredAuthError(res, {
        httpCode: 422,
        errorCode: "WEAK_PASSWORD",
        title: "Kata Sandi Terlalu Pendek",
        message:
          "Kata sandi baru wajib terdiri dari minimal 6 karakter. Gunakan kombinasi huruf dan angka untuk keamanan akun Anda.",
        actionHint: "RETRY",
      });
    }

    // Path A: Mailjet Reset Token (Primary Industry-Standard Flow)
    if (rawEmail && rawToken) {
      const email = String(rawEmail).trim().toLowerCase();
      const token = String(rawToken).trim();
      const user = await User.findOne({ email });

      if (!user || !user.resetPasswordTokenHash) {
        return sendStructuredAuthError(res, {
          httpCode: 410,
          errorCode: "RECOVERY_LINK_EXPIRED",
          title: "Tautan Pemulihan Sudah Tidak Berlaku",
          message:
            "Tautan pengaturan ulang kata sandi ini sudah pernah digunakan atau tidak berlaku lagi. Silakan minta tautan pemulihan baru.",
          actionHint: "REQUEST_NEW_RESET",
        });
      }

      if (hashToken(token) !== user.resetPasswordTokenHash) {
        return sendStructuredAuthError(res, {
          httpCode: 400,
          errorCode: "INVALID_RECOVERY_LINK",
          title: "Tautan Pemulihan Tidak Valid",
          message:
            "Tautan ini sudah tidak berlaku karena Anda telah meminta tautan pemulihan yang lebih baru. Silakan gunakan tautan dari email terbaru.",
          actionHint: "REQUEST_NEW_RESET",
        });
      }

      if (
        !user.resetPasswordExpiresAt ||
        new Date(user.resetPasswordExpiresAt).getTime() < Date.now()
      ) {
        return sendStructuredAuthError(res, {
          httpCode: 410,
          errorCode: "RECOVERY_LINK_EXPIRED",
          title: "Tautan Pemulihan Sudah Kedaluwarsa",
          message:
            "Batas waktu 30 menit untuk tautan pemulihan ini telah berakhir. Silakan minta tautan pengaturan ulang kata sandi yang baru.",
          actionHint: "REQUEST_NEW_RESET",
        });
      }

      const previousPassword = decryptSyncSecret(user.authSyncCipher);
      if (previousPassword && previousPassword === String(newPassword)) {
        return sendStructuredAuthError(res, {
          httpCode: 422,
          errorCode: "SAME_PASSWORD",
          title: "Kata Sandi Tidak Boleh Sama",
          message:
            "Kata sandi baru yang Anda masukkan sama dengan kata sandi lama Anda. Silakan gunakan kata sandi yang berbeda.",
          actionHint: "RETRY",
        });
      }

      // Sync new password to Supabase Auth
      const { scopedClient, accessToken, refreshToken } =
        await obtainUserSupabaseSession(user);

      if (accessToken) {
        const { error: updateErr } = await scopedClient.auth.updateUser({
          password: String(newPassword),
        });

        if (updateErr) {
          const errCode = String(updateErr.code || "").toLowerCase();
          const errMsg = String(updateErr.message || "").toLowerCase();
          if (
            errCode === "same_password" ||
            errMsg.includes("different from the old password")
          ) {
            return sendStructuredAuthError(res, {
              httpCode: 422,
              errorCode: "SAME_PASSWORD",
              title: "Kata Sandi Tidak Boleh Sama",
              message:
                "Kata sandi baru tidak boleh sama dengan kata sandi lama Anda. Silakan buat kata sandi yang berbeda.",
              actionHint: "RETRY",
            });
          }
          if (errCode === "weak_password") {
            return sendStructuredAuthError(
              res,
              mapAuthError(updateErr, "reset")
            );
          }
        } else {
          // Re-authenticate with the new password to store fresh tokens
          const { data: freshSign } =
            await scopedClient.auth.signInWithPassword({
              email,
              password: String(newPassword),
            });
          if (freshSign?.session) {
            user.accessToken = freshSign.session.access_token;
            user.refreshToken = freshSign.session.refresh_token;
          } else {
            user.accessToken = accessToken;
            if (refreshToken) user.refreshToken = refreshToken;
          }
        }
      } else if (isJwtExpiredOrInvalid(user.accessToken)) {
        const issued = issueBackendSessionToken(user);
        user.accessToken = issued.accessToken;
        user.refreshToken = issued.refreshToken;
      }

      // Update MongoDB user state and invalidate the one-time reset token
      user.authSyncCipher = encryptSyncSecret(String(newPassword));
      user.isEmailVerified = true;
      user.activationTokenHash = null;
      user.activationTokenExpiresAt = null;
      user.resetPasswordTokenHash = null;
      user.resetPasswordExpiresAt = null;
      user.updatedAt = new Date();
      await user.save();

      return response.sendSuccess(res, {
        message:
          "Kata sandi Anda berhasil diperbarui. Silakan masuk menggunakan kata sandi baru Anda.",
        data: { email: user.email },
      });
    }

    // Path B: Fallback Supabase Recovery Access Token
    if (fallbackAccessToken) {
      const scopedClient = createScopedSupabaseClient();
      const { data: sessionData, error: sessionErr } =
        await scopedClient.auth.setSession({
          access_token: String(fallbackAccessToken),
          refresh_token: String(fallbackRefreshToken || ""),
        });

      if (sessionErr || !sessionData?.user?.email) {
        return sendStructuredAuthError(res, {
          httpCode: 410,
          errorCode: "RECOVERY_LINK_EXPIRED",
          title: "Sesi Pemulihan Sudah Kedaluwarsa",
          message:
            "Tautan pemulihan kata sandi sudah kedaluwarsa atau tidak valid. Silakan minta tautan pengaturan ulang kata sandi yang baru.",
          actionHint: "REQUEST_NEW_RESET",
        });
      }

      const { error: updateErr } = await scopedClient.auth.updateUser({
        password: String(newPassword),
      });

      if (updateErr) {
        return sendStructuredAuthError(res, mapAuthError(updateErr, "reset"));
      }

      const email = sessionData.user.email.toLowerCase();
      await User.findOneAndUpdate(
        { email },
        {
          $set: {
            isEmailVerified: true,
            authSyncCipher: encryptSyncSecret(String(newPassword)),
            resetPasswordTokenHash: null,
            resetPasswordExpiresAt: null,
            updatedAt: new Date(),
          },
        }
      );

      return response.sendSuccess(res, {
        message:
          "Kata sandi Anda berhasil diperbarui. Silakan masuk menggunakan kata sandi baru Anda.",
        data: { email },
      });
    }

    return sendStructuredAuthError(res, {
      httpCode: 400,
      errorCode: "INVALID_RECOVERY_LINK",
      title: "Tautan Pemulihan Tidak Valid",
      message:
        "Token pemulihan kata sandi tidak ditemukan. Silakan ulangi permintaan lupa kata sandi.",
      actionHint: "REQUEST_NEW_RESET",
    });
  } catch (err: any) {
    console.error("Reset password error:", err);
    return sendStructuredAuthError(res, mapAuthError(err, "reset"));
  }
};

const successOAuth = async (req: Request, res: Response): Promise<void> => {
  const { email, accessToken, refreshToken, fullName, phoneNumber } = req.body;
  try {
    const cleanEmail = String(email || "")
      .trim()
      .toLowerCase();
    const existing = await User.findOne({ email: cleanEmail }).lean();

    const authenticatedUser = await User.findOneAndUpdate(
      { email: cleanEmail },
      {
        $set: {
          accessToken,
          refreshToken,
          isEmailVerified: true,
          activationTokenHash: null,
          activationTokenExpiresAt: null,
          updatedAt: new Date(),
          ...(fullName && !existing?.fullName ? { fullName } : {}),
          ...(phoneNumber && !existing?.phoneNumber ? { phoneNumber } : {}),
        },
        $setOnInsert: {
          fullName: fullName || cleanEmail.split("@")[0],
          phoneNumber: phoneNumber || "",
          email: cleanEmail,
          role: "user",
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    // Opportunistically heal Supabase password if user previously set/reset a password via Mailjet
    const syncedPassword = decryptSyncSecret(existing?.authSyncCipher);
    if (syncedPassword && accessToken) {
      try {
        const scopedClient = createScopedSupabaseClient();
        await scopedClient.auth.setSession({
          access_token: String(accessToken),
          refresh_token: String(refreshToken || ""),
        });
        await scopedClient.auth.updateUser({ password: syncedPassword });
      } catch {
        // Non-fatal opportunistic password sync
      }
    }

    return response.sendSuccess(res, {
      data: sanitizeUserPayload(authenticatedUser),
    });
  } catch (error) {
    console.error("Unexpected successOAuth error:", error);
    return response.sendInternalError(res, error);
  }
};

export default {
  loginOAuth,
  login,
  register,
  resendActivation,
  verifyActivation,
  forgotPassword,
  verifyResetToken,
  resetPassword,
  successOAuth,
};
