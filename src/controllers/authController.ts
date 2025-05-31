import { Request, Response } from "express";
import response from "../libs/utils/responses";
import supabase from "../libs/supabase/client";
import { User } from "../models/userModel";

const loginOAuth = async (req: Request, res: Response): Promise<void> => {
  const redirectTo = "http://localhost:4000/auth/callback";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) {
    console.error("Login error:", error);
    return response.sendInternalError(res, { error });
  }

  return response.sendSuccess(res, { data });
};

const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const { data: authUser, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.code === "invalid_credentials") {
        return response.sendBadRequest(res, "Invalid Credentials");
      }
      throw error;
    }

    const user = await User.findOneAndUpdate(
      { email },
      {
        accessToken: authUser.session.access_token,
        refreshToken: authUser.session.refresh_token,
      },
      {
        new: true,
        projection: {
          email: 1,
          phoneNumber: 1,
          fullName: 1,
          accessToken: 1,
          refreshToken: 1,
          _id: 1,
        },
      }
    );

    return response.sendSuccess(res, { data: user });
  } catch (err: any) {
    console.error("Login error:", err);
    return response.sendInternalError(res, err);
  }
};

const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fullName, email, password, phoneNumber } = req.body;

    const { data: registUser, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone_number: phoneNumber,
        },
      },
    });

    if (error) {
      console.error("Register error:", error.message);
      if (error.code === "weak_password") {
        return response.sendInvalid(res, "Weak Password");
      }
      throw error;
    }

    const createdUser = await User.create({
      fullName,
      email,
      phoneNumber,
      accessToken: registUser.session?.access_token,
      refreshToken: registUser.session?.refresh_token,
    });

    return response.sendCreated(res, { data: createdUser });
  } catch (err: any) {
    console.error("Unexpected register error:", err);
    return response.sendInternalError(res, err);
  }
};

const successOAuth = async (req: Request, res: Response): Promise<void> => {
  const { email, accessToken, refreshToken, fullName, phoneNumber } = req.body;
  // console.log(data);
  try {
    const authenticatedUser = await User.findOneAndUpdate(
      { email: email },
      {
        $set: {
          accessToken,
          refreshToken,
        },
        $setOnInsert: {
          fullName,
          phoneNumber: phoneNumber || "",
          email,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );
    return response.sendSuccess(res, { data: authenticatedUser });
  } catch (error) {
    console.error("Unexpected successOAuth error:", error);
    return response.sendInternalError(res, error);
  }
};

export default {
  loginOAuth,
  login,
  register,
  successOAuth,
};
