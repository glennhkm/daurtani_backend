import { Request, Response } from "express";
import { User } from "../models/userModel";
import { AuthRequest } from "./storeController";
import response from "../libs/utils/responses";
import mongoose from "mongoose";
import { Category } from "../models/categoryModel";

const getCategories = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const categories = await Category.find();
    response.sendSuccess(res, { data: categories });
  } catch (error) {
    response.sendInternalError(res, error);
  }
};

const createCategories = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const newCategory = await Category.create(req.body);
    response.sendCreated(res, { data: newCategory });
  } catch (error) {
    response.sendInternalError(res, error);
  }
};

export default {
  getCategories,
  createCategories,
};
