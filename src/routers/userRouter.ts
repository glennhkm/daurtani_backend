import express from 'express';
import userController from '../controllers/userController';
import middleware from '../libs/utils/middleware';
// import middleware jika ada, misal:
// import { requireAuth } from '../libs/helpers/middleware';

const userRouter = express.Router();

// userRouter.get('/', userController.getAllUsers);
userRouter.post('/', userController.createUser);
userRouter.get('/', middleware.authorization, userController.getUserById);
userRouter.put('/', middleware.authorization, userController.updateUser);

export default userRouter;