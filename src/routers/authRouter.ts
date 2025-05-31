import express from 'express';
import authController from '../controllers/authController';

const authRouter = express.Router();

authRouter.get('/login-oauth', authController.loginOAuth);
authRouter.post('/login', authController.login);
authRouter.post('/register', authController.register);
authRouter.post('/success-oauth', authController.successOAuth);

export default authRouter;