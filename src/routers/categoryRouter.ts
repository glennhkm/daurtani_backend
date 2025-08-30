import { Router, Request, Response } from "express";
import categoryController from "../controllers/categoryController";

const categoryRouter = Router();

categoryRouter.get("/", categoryController.getCategories);
categoryRouter.post("/", categoryController.createCategories);
categoryRouter.get("/with-group", categoryController.getCategoriesWithGroup);

export default categoryRouter;