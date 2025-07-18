import { Request, Response } from "express";
import { FarmWaste } from "../models/farmWasteModel";
import { UnitPrice } from "../models/unitPriceModel";
import { Store } from "../models/storeModel";
import mongoose from "mongoose";
import response from "../libs/utils/responses";

// Create a new farm waste product
const createFarmWaste = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId, wasteName, description, unitPrices, imageUrls } = req.body;

    // Validate store exists
    const storeExists = await Store.findById(storeId);
    if (!storeExists) {
      response.sendNotFound(res, "Store not found");
      return;
    }

    // Create farm waste
    const newFarmWaste = await FarmWaste.create({
      storeId,
      wasteName,
      description,
      imageUrls: imageUrls || [],
      averageRating: 0,
    });

    // Add unit prices if provided
    if (unitPrices && Array.isArray(unitPrices)) {
      // Validate that at least one base unit is provided
      const hasBaseUnit = unitPrices.some(unit => unit.isBaseUnit === true);
      if (!hasBaseUnit) {
        await FarmWaste.findByIdAndDelete(newFarmWaste._id);
        response.sendBadRequest(res, "At least one base unit must be provided");
        return;
      }

      // Create unit prices
      const unitPricePromises = unitPrices.map(unit => {
        // If it's a base unit, equalWith should be 1
        if (unit.isBaseUnit) {
          unit.equalWith = 1;
        } else if (!unit.equalWith || unit.equalWith <= 0) {
          // Non-base units must have equalWith value
          throw new Error(`Unit ${unit.unit} must have a valid equalWith value`);
        }

        return UnitPrice.create({
          farmWasteId: newFarmWaste._id,
          unit: unit.unit,
          pricePerUnit: unit.pricePerUnit,
          isBaseUnit: unit.isBaseUnit,
          stock: unit.stock || 0,
          equalWith: unit.equalWith,
        });
      });

      await Promise.all(unitPricePromises);
    }

    // Return the created farm waste with its unit prices
    const farmWasteWithUnits = await FarmWaste.findById(newFarmWaste._id);
    const unitPricesData = await UnitPrice.find({ farmWasteId: newFarmWaste._id });

    response.sendCreated(res, {
      data: {
        farmWaste: farmWasteWithUnits,
        unitPrices: unitPricesData,
      },
      message: "Farm waste created successfully",
    });
  } catch (error: any) {
    console.error("Error creating farm waste:", error);
    response.sendInternalError(res, error.message || "Failed to create farm waste");
  }
};

// Get all farm waste products with their unit prices
const getAllFarmWastes = async (req: Request, res: Response): Promise<void> => {
  try {
    const farmWastes = await FarmWaste.find().sort({ createdAt: -1 });
    
    // Get all unit prices for these farm wastes
    const farmWasteIds = farmWastes.map(waste => waste._id);
    const unitPrices = await UnitPrice.find({
      farmWasteId: { $in: farmWasteIds }
    });
    
    // Get store information for these farm wastes
    const storeIds = farmWastes.map(waste => waste.storeId);
    const stores = await Store.find({
      _id: { $in: storeIds }
    });
    
    // Map farm wastes with their unit prices and store info
    const farmWastesWithDetails = farmWastes.map(waste => {
      const wasteUnitPrices = unitPrices.filter(
        price => price.farmWasteId.toString() === (waste._id as mongoose.Types.ObjectId).toString()
      );
      
      const store = stores.find(
        store => (store._id as mongoose.Types.ObjectId).toString() === waste.storeId.toString()
      );
      
      return {
        _id: waste._id,
        wasteName: waste.wasteName,
        description: waste.description,
        imageUrls: waste.imageUrls,
        averageRating: waste.averageRating,
        createdAt: waste.createdAt,
        updatedAt: waste.updatedAt,
        store: {
          _id: store?._id,
          storeName: store?.storeName,
          provinsi: store?.provinsi,
          kota: store?.kota,
          kecamatan: store?.kecamatan,
          detailAlamat: store?.detailAlamat,
        },
        unitPrices: wasteUnitPrices.map(price => ({
          _id: price._id,
          unit: price.unit,
          pricePerUnit: price.pricePerUnit,
          isBaseUnit: price.isBaseUnit,
          stock: price.stock,
          equalWith: price.equalWith,
        })),
      };
    });

    response.sendSuccess(res, {
      count: farmWastesWithDetails.length,
      data: farmWastesWithDetails,
      message: "Farm wastes retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error fetching farm wastes:", error);
    response.sendInternalError(res, error.message || "Failed to fetch farm wastes");
  }
};

// Get a single farm waste product by ID
const getFarmWasteById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      response.sendBadRequest(res, "Invalid farm waste ID");
      return;
    }

    const farmWaste = await FarmWaste.findById(id);
    
    if (!farmWaste) {
      response.sendNotFound(res, "Farm waste not found");
      return;
    }

    // Get unit prices for this farm waste
    const unitPrices = await UnitPrice.find({ farmWasteId: id });
    
    // Get store information
    const store = await Store.findById(farmWaste.storeId);

    response.sendSuccess(res, {
      data: {
        _id: farmWaste._id,
        wasteName: farmWaste.wasteName,
        description: farmWaste.description,
        imageUrls: farmWaste.imageUrls,
        averageRating: farmWaste.averageRating,
        createdAt: farmWaste.createdAt,
        updatedAt: farmWaste.updatedAt,
        store: {
          _id: store?._id,
          storeName: store?.storeName,
          averageRating: store?.averageRating,
          provinsi: store?.provinsi,
          kota: store?.kota,
          kecamatan: store?.kecamatan,
          detailAlamat: store?.detailAlamat,
          whatsAppNumber: store?.whatsAppNumber,
          instagram: store?.instagram,
          facebook: store?.facebook,
          officialWebsite: store?.officialWebsite,
        },
        unitPrices: unitPrices.map(price => ({
          _id: price._id,
          unit: price.unit,
          pricePerUnit: price.pricePerUnit,
          isBaseUnit: price.isBaseUnit,
          stock: price.stock,
          equalWith: price.equalWith,
        })),
      },
      message: "Farm waste retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error fetching farm waste:", error);
    response.sendInternalError(res, error.message || "Failed to fetch farm waste");
  }
};

// Update farm waste product
const updateFarmWaste = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { wasteName, description, imageUrls, unitPrices } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      response.sendBadRequest(res, "Invalid farm waste ID");
      return;
    }

    const farmWaste = await FarmWaste.findById(id);
    
    if (!farmWaste) {
      response.sendNotFound(res, "Farm waste not found");
      return;
    }

    // Update farm waste details
    const updatedFarmWaste = await FarmWaste.findByIdAndUpdate(
      id,
      {
        wasteName,
        description,
        imageUrls: imageUrls || farmWaste.imageUrls,
        updatedAt: new Date(),
      },
      { new: true }
    );

    // Update unit prices if provided
    if (unitPrices && Array.isArray(unitPrices)) {
      // Validate that at least one base unit is provided
      const hasBaseUnit = unitPrices.some(unit => unit.isBaseUnit === true);
      if (!hasBaseUnit) {
        response.sendBadRequest(res, "At least one base unit must be provided");
        return;
      }

      // Delete existing unit prices
      await UnitPrice.deleteMany({ farmWasteId: id });

      // Create new unit prices
      const unitPricePromises = unitPrices.map(unit => {
        if (unit.isBaseUnit) {
          unit.equalWith = 1;
        } else if (!unit.equalWith || unit.equalWith <= 0) {
          throw new Error(`Unit ${unit.unit} must have a valid equalWith value`);
        }

        return UnitPrice.create({
          farmWasteId: id,
          unit: unit.unit,
          pricePerUnit: unit.pricePerUnit,
          isBaseUnit: unit.isBaseUnit,
          stock: unit.stock || 0,
          equalWith: unit.equalWith,
        });
      });

      await Promise.all(unitPricePromises);
    }

    // Get updated unit prices
    const updatedUnitPrices = await UnitPrice.find({ farmWasteId: id });

    response.sendSuccess(res, {
      data: {
        farmWaste: updatedFarmWaste,
        unitPrices: updatedUnitPrices,
      },
      message: "Farm waste updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating farm waste:", error);
    response.sendInternalError(res, error.message || "Failed to update farm waste");
  }
};

// Delete farm waste product
const deleteFarmWaste = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      response.sendBadRequest(res, "Invalid farm waste ID");
      return;
    }

    const farmWaste = await FarmWaste.findById(id);
    
    if (!farmWaste) {
      response.sendNotFound(res, "Farm waste not found");
      return;
    }

    // Delete all associated unit prices first
    await UnitPrice.deleteMany({ farmWasteId: id });
    
    // Delete the farm waste
    await FarmWaste.findByIdAndDelete(id);

    response.sendSuccess(res, {
      message: "Farm waste deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting farm waste:", error);
    response.sendInternalError(res, error.message || "Failed to delete farm waste");
  }
};

export default {
  createFarmWaste,
  getAllFarmWastes,
  getFarmWasteById,
  updateFarmWaste,
  deleteFarmWaste,
};
