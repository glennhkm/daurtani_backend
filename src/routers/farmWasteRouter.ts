import { Router, Request, Response } from "express";
import farmWasteController from "../controllers/farmWasteController";

const router = Router();

// Get all farm wastes
router.get("/", farmWasteController.getAllFarmWastes);

// Get a single farm waste by ID
router.get("/:id", farmWasteController.getFarmWasteById);

// Create a new farm waste
router.post("/", farmWasteController.createFarmWaste);

// Update a farm waste
router.put("/:id", farmWasteController.updateFarmWaste);

// Delete a farm waste
router.delete("/:id", farmWasteController.deleteFarmWaste);

export default router;