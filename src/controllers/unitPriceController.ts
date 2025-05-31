import { Request, Response } from "express";
import { UnitPrice } from "../models/unitPriceModel";
import { FarmWaste } from "../models/farmWasteModel";
import mongoose from "mongoose";
import response from "../libs/utils/responses";

// Create a new unit price
const createUnitPrice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { farmWasteId, unit, pricePerUnit, isBaseUnit, stock, equalWith } = req.body;

    // Check if farm waste exists
    const farmWaste = await FarmWaste.findById(farmWasteId);
    if (!farmWaste) {
      response.sendNotFound(res, "Farm waste not found");
      return;
    }

    // Check if this is a base unit
    if (isBaseUnit) {
      // Check if there's already a base unit for this farm waste
      const existingBaseUnit = await UnitPrice.findOne({
        farmWasteId,
        isBaseUnit: true,
      });

      if (existingBaseUnit) {
        response.sendBadRequest(res, "This farm waste already has a base unit");
        return;
      }

      // For base units, equalWith should be 1
      req.body.equalWith = 1;
    } else {
      // For non-base units, equalWith must be provided and > 0
      if (!equalWith || equalWith <= 0) {
        response.sendBadRequest(res, "Non-base units must have a valid equalWith value");
        return;
      }
    }

    const newUnitPrice = await UnitPrice.create(req.body);

    response.sendCreated(res, {
      data: newUnitPrice,
      message: "Unit price created successfully",
    });
  } catch (error: any) {
    console.error("Error creating unit price:", error);
    response.sendInternalError(res, error.message || "Failed to create unit price");
  }
};

// Get all unit prices for a farm waste
const getUnitPricesByFarmWasteId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { farmWasteId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(farmWasteId)) {
      response.sendBadRequest(res, "Invalid farm waste ID");
      return;
    }

    // Check if farm waste exists
    const farmWaste = await FarmWaste.findById(farmWasteId);
    if (!farmWaste) {
      response.sendNotFound(res, "Farm waste not found");
      return;
    }

    const unitPrices = await UnitPrice.find({ farmWasteId });

    response.sendSuccess(res, {
      count: unitPrices.length,
      data: unitPrices,
      message: "Unit prices retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error fetching unit prices:", error);
    response.sendInternalError(res, error.message || "Failed to fetch unit prices");
  }
};

// Get a single unit price by ID
const getUnitPriceById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      response.sendBadRequest(res, "Invalid unit price ID");
      return;
    }

    const unitPrice = await UnitPrice.findById(id);
    
    if (!unitPrice) {
      response.sendNotFound(res, "Unit price not found");
      return;
    }

    response.sendSuccess(res, {
      data: unitPrice,
      message: "Unit price retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error fetching unit price:", error);
    response.sendInternalError(res, error.message || "Failed to fetch unit price");
  }
};

// Update a unit price
const updateUnitPrice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { pricePerUnit, stock } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      response.sendBadRequest(res, "Invalid unit price ID");
      return;
    }

    const unitPrice = await UnitPrice.findById(id);
    
    if (!unitPrice) {
      response.sendNotFound(res, "Unit price not found");
      return;
    }

    // Don't allow changing the unit, isBaseUnit, or equalWith
    // These would require more complex validation
    const updatedUnitPrice = await UnitPrice.findByIdAndUpdate(
      id,
      {
        pricePerUnit: pricePerUnit !== undefined ? pricePerUnit : unitPrice.pricePerUnit,
        stock: stock !== undefined ? stock : unitPrice.stock,
        updatedAt: new Date(),
      },
      { new: true }
    );

    response.sendSuccess(res, {
      data: updatedUnitPrice,
      message: "Unit price updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating unit price:", error);
    response.sendInternalError(res, error.message || "Failed to update unit price");
  }
};

// Delete a unit price
const deleteUnitPrice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      response.sendBadRequest(res, "Invalid unit price ID");
      return;
    }

    const unitPrice = await UnitPrice.findById(id);
    
    if (!unitPrice) {
      response.sendNotFound(res, "Unit price not found");
      return;
    }

    // Don't allow deleting the base unit if there are other units
    if (unitPrice.isBaseUnit) {
      const otherUnits = await UnitPrice.find({
        farmWasteId: unitPrice.farmWasteId,
        _id: { $ne: id },
      });

      if (otherUnits.length > 0) {
        response.sendBadRequest(res, "Cannot delete the base unit while other units exist");
        return;
      }
    }

    await UnitPrice.findByIdAndDelete(id);

    response.sendSuccess(res, {
      message: "Unit price deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting unit price:", error);
    response.sendInternalError(res, error.message || "Failed to delete unit price");
  }
};

export default {
  createUnitPrice,
  getUnitPricesByFarmWasteId,
  getUnitPriceById,
  updateUnitPrice,
  deleteUnitPrice,
}; 