import { Router, Request, Response } from "express";
import storeController from "../controllers/storeController";
import middleware from "../libs/utils/middleware";

const storeRouter = Router();

// Get all stores
// storeRouter.get("/", (req: Request, res: Response) => storeController.getAllStores(req, res));

// // Get a single store by ID
// storeRouter.get("/:id", (req: Request, res: Response) => storeController.getStoreById(req, res));

// Get a store's products
storeRouter.get("/products", middleware.authorization, storeController.getStoreProducts);

// Create a new store - Protected route
storeRouter.post("/", middleware.authorization, storeController.createStore);

// // Update a store
storeRouter.put("/:id", middleware.authorization, storeController.updateStore);

// // Delete a store
// storeRouter.delete("/:id", (req: Request, res: Response) => storeController.deleteStore(req, res));

export default storeRouter; 