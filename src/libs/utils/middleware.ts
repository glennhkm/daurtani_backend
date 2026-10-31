import { NextFunction, Response, Request } from "express";
import response from "./responses";
import { createScopedSupabaseClient } from "../supabase/client";
import { User } from "../../models/userModel";
import {
  verifyBackendSessionToken,
  isJwtExpiredOrInvalid,
  decodeJwtPayloadUnsafe,
} from "./sessionToken";

interface AuthRequest extends Request {
  user?: any;
}

const authorization = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return response.sendUnauthorized(res, "Authorization token is required");
    }

    const token = authHeader.split(" ")[1]?.trim();
    if (!token || token === "null" || token === "undefined") {
      return response.sendUnauthorized(res, "Invalid token format");
    }

    // 1. Fast-path check for DaurTani backend-signed session token (HS256)
    const localTokenCheck = verifyBackendSessionToken(token);
    if (localTokenCheck.valid && localTokenCheck.payload?.email) {
      const mongoUser = await User.findOne({
        email: localTokenCheck.payload.email.toLowerCase(),
      });
      if (!mongoUser) {
        return response.sendUnauthorized(res, "User not found in database");
      }

      req.user = {
        id: mongoUser._id,
        email: mongoUser.email,
        fullName: mongoUser.fullName,
        role: mongoUser.role || "user",
        supabaseId: localTokenCheck.payload.sub || String(mongoUser._id),
      };
      return next();
    }

    // 2. Verify token with a scoped Supabase client (avoids mutating shared global auth state)
    const scopedSupabase = createScopedSupabaseClient();
    const {
      data: { user: supabaseUser },
      error,
    } = await scopedSupabase.auth.getUser(token);

    if (!error && supabaseUser?.email) {
      const mongoUser = await User.findOne({
        email: supabaseUser.email.toLowerCase(),
      });

      if (!mongoUser) {
        return response.sendUnauthorized(res, "User not found in database");
      }

      req.user = {
        id: mongoUser._id,
        email: mongoUser.email,
        fullName: mongoUser.fullName,
        role: mongoUser.role || "user",
        supabaseId: supabaseUser.id,
      };

      return next();
    }

    // 3. Fallback: If Supabase GoTrue session was rotated/missing (AuthSessionMissingError)
    // but the JWT is not expired and matches the user's active accessToken in MongoDB
    if (!isJwtExpiredOrInvalid(token)) {
      const mongoUserByToken = await User.findOne({ accessToken: token });
      if (mongoUserByToken) {
        const decoded = decodeJwtPayloadUnsafe(token);
        req.user = {
          id: mongoUserByToken._id,
          email: mongoUserByToken.email,
          fullName: mongoUserByToken.fullName,
          role: mongoUserByToken.role || "user",
          supabaseId: decoded?.sub || String(mongoUserByToken._id),
        };
        return next();
      }
    }

    return response.sendUnauthorized(res, "Invalid or expired token");
  } catch (error: any) {
    console.error("Authorization error:", error);
    return response.sendInternalError(res, "Authentication failed");
  }
};

const adminAuthorization = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  await authorization(req, res, () => {
    if (req.user?.role !== "admin") {
      return response.sendForbidden(
        res,
        "Akses ditolak: Hanya untuk administrator"
      );
    }
    next();
  });
};

export default {
  authorization,
  adminAuthorization,
};
