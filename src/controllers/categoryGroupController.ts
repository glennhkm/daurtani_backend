import { Request, Response } from "express";
import { AuthRequest } from "./storeController";
import response from "../libs/utils/responses";
import mongoose from "mongoose";
import { CategoryGroup } from "../models/categoryGroupModel";
import { Console } from "console";

const getCategoryGroups = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const categoryGroups = await CategoryGroup.find();
    response.sendSuccess(res, { data: categoryGroups });
  } catch (error) {
    response.sendInternalError(res, error);
  }
};

const createCategoryGroups = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const newCategoryGroup = await CategoryGroup.create(req.body);
    response.sendCreated(res, { data: newCategoryGroup });
  } catch (error) {
    response.sendInternalError(res, error);
  }
};

export default {
  getCategoryGroups,
  createCategoryGroups,
};