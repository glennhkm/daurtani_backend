import express from 'express';
import userController from '../controllers/userController';
// import middleware jika ada, misal:
// import { requireAuth } from '../libs/helpers/middleware';

const userRouter = express.Router();

userRouter.get('/', userController.getAllUsers);
userRouter.post('/', userController.createUser);

export default userRouter;