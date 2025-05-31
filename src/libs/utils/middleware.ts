import { NextFunction, Response, Request } from "express";
import response from "./responses";
import supabase from "../supabase/client";
import { User } from "../../models/userModel";

interface AuthRequest extends Request {
  user?: any;
}

const authorization = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Check if Authorization header exists
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.sendUnauthorized(res, "Authorization token is required");
    }

    // Extract the token
    const token = authHeader.split(' ')[1];
    if (!token) {
      return response.sendUnauthorized(res, "Invalid token format");
    }

    // Verify token with Supabase
    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);
    
    if (error || !supabaseUser) {
      console.error("Supabase auth error:", error);
      return response.sendUnauthorized(res, "Invalid or expired token");
    }

    // Find the user in MongoDB using the email from Supabase
    const mongoUser = await User.findOne({ email: supabaseUser.email });
    
    if (!mongoUser) {
      return response.sendUnauthorized(res, "User not found in database");
    }

    // Attach user data to request object
    req.user = {
      id: mongoUser._id,
      email: mongoUser.email,
      fullName: mongoUser.fullName,
      supabaseId: supabaseUser.id
    };

    next();
  } catch (error: any) {
    console.error("Authorization error:", error);
    return response.sendInternalError(res, "Authentication failed");
  }
};

export default {
  authorization,
};
