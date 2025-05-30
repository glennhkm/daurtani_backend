import express from 'express';
import authController from '../controllers/authController';

const authRouter = express.Router();

// authRouter.post('/login', authController.loginOAuth);
authRouter.get('/login-oauth', authController.loginOAuth);
authRouter.post('/login', authController.login);
authRouter.post('/register', authController.register);

export default authRouter;