import { Request, Response } from 'express';
import { User } from '../models/User';
import response from '../libs/utils/responses';

const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ message: 'Name, email, and password are required.' });
      return;
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409).json({ message: 'Email already registered.' });
      return;
    }
    const user = new User({ name, email, password });
    await user.save();
    response.sendCreated(res, { user });
  } catch (error) {
    response.sendInternalError(res, { error });
  }
};

const getAllUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find();
    response.sendSuccess(res, { users });
  } catch (error) {
    response.sendInternalError(res, { error })
  }
};


export default {
  createUser,
  getAllUsers,
};
