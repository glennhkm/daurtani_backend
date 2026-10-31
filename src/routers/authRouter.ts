import express from "express";
import authController from "../controllers/authController";

const authRouter = express.Router();

authRouter.get("/login-oauth", authController.loginOAuth);
authRouter.post("/login", authController.login);
authRouter.post("/register", authController.register);
authRouter.post("/resend-activation", authController.resendActivation);
authRouter.post("/verify-activation", authController.verifyActivation);
authRouter.post("/forgot-password", authController.forgotPassword);
authRouter.post("/verify-reset-token", authController.verifyResetToken);
authRouter.post("/reset-password", authController.resetPassword);
authRouter.post("/success-oauth", authController.successOAuth);

export default authRouter;
