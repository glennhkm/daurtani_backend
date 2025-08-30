import { Router, Request, Response } from "express";
import categoryGroupController from "../controllers/categoryGroupController";

const categoryGroupRouter = Router();

categoryGroupRouter.get("/", categoryGroupController.getCategoryGroups);
categoryGroupRouter.post("/", categoryGroupController.createCategoryGroups);

export default categoryGroupRouter;