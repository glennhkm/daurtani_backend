import { Router, Request, Response } from "express";
import farmWasteController from "../controllers/farmWasteController";

const router = Router();

// Get all farm wastes
router.get("/", (req: Request, res: Response) => farmWasteController.getAllFarmWastes(req, res));

// Get a single farm waste by ID
router.get("/:id", (req: Request, res: Response) => farmWasteController.getFarmWasteById(req, res));

// Create a new farm waste
router.post("/", farmWasteController.createFarmWaste);

// Update a farm waste
router.put("/:id", farmWasteController.updateFarmWaste);

// Delete a farm waste
router.delete("/:id", (req: Request, res: Response) => farmWasteController.deleteFarmWaste(req, res));

export default router;