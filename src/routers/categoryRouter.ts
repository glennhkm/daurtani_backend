import { Router, Request, Response } from "express";
import categoryController from "../controllers/categoryController";

const categoryRouter = Router();

categoryRouter.get("/", categoryController.getCategories);
categoryRouter.post("/", categoryController.createCategories);

export default categoryRouter;