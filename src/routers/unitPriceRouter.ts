import { Router, Request, Response } from "express";
import unitPriceController from "../controllers/unitPriceController";

const router = Router();

// Get all unit prices for a farm waste
router.get("/farm-waste/:farmWasteId", (req: Request, res: Response) => unitPriceController.getUnitPricesByFarmWasteId(req, res));

// Get a single unit price by ID
router.get("/:id", (req: Request, res: Response) => unitPriceController.getUnitPriceById(req, res));

// Create a new unit price
router.post("/", (req: Request, res: Response) => unitPriceController.createUnitPrice(req, res));

// Update a unit price
router.put("/:id", (req: Request, res: Response) => unitPriceController.updateUnitPrice(req, res));

// Delete a unit price
router.delete("/:id", (req: Request, res: Response) => unitPriceController.deleteUnitPrice(req, res));

export default router; 