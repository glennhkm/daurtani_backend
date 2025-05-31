import { Request, Response } from "express";
import { Store, IStore } from "../models/storeModel";
import { FarmWaste, IFarmWaste } from "../models/farmWasteModel";
import { UnitPrice, IUnitPrice } from "../models/unitPriceModel";
import mongoose from "mongoose";
import response from "../libs/utils/responses";

// Define AuthRequest interface to include user property
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName: string;
    supabaseId: string;
  };
}

// // Create a new store
const createStore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { storeAddressId, storeName, description } = req.body;
    const ownerId = req.user?.id; // Get user ID from authenticated request
    
    if (!ownerId) {
      return response.sendUnauthorized(res, "User not authenticated");
    }

    const newStore = await Store.create({
      storeAddressId,
      ownerId,
      storeName,
      description,
      averageRating: 0,
    });

    response.sendCreated(res, {
      data: newStore,
      message: "Store created successfully",
    });
  } catch (error: any) {
    console.error("Error creating store:", error);
    response.sendInternalError(res, error.message || "Failed to create store");
  }
};

// // Get all stores
// const getAllStores = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const stores = await Store.find().sort({ createdAt: -1 });

//     response.sendSuccess(res, {
//       count: stores.length,
//       data: stores,
//       message: "Stores retrieved successfully",
//     });
//   } catch (error: any) {
//     console.error("Error fetching stores:", error);
//     response.sendInternalError(res, error.message || "Failed to fetch stores");
//   }
// };

// // Get a store by ID
// const getStoreById = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { id } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       response.sendBadRequest(res, "Invalid store ID");
//       return;
//     }

//     const store = await Store.findById(id);
    
//     if (!store) {
//       response.sendNotFound(res, "Store not found");
//       return;
//     }

//     response.sendSuccess(res, {
//       data: store,
//       message: "Store retrieved successfully",
//     });
//   } catch (error: any) {
//     console.error("Error fetching store:", error);
//     response.sendInternalError(res, error.message || "Failed to fetch store");
//   }
// };

// Get a store's products
const getStoreProducts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;

    if (!ownerId || !mongoose.Types.ObjectId.isValid(ownerId)) {
      response.sendBadRequest(res, "Invalid user ID");
      return;
    }

    // Find stores owned by this user
    const stores = await Store.find({ ownerId }).lean();
    
    if (!stores || stores.length === 0) {
      response.sendSuccess(res, {
        data: [],
        message: "No stores found for this user",
      });
      return;
    }

    // Get all store IDs
    const storeIds = stores.map(store => store._id);
    
    // Find all farm wastes for these stores
    const farmWastes = await FarmWaste.find({ storeId: { $in: storeIds } }).lean();
    
    // Get all unit prices for these farm wastes
    const farmWasteIds = farmWastes.map(waste => waste._id);
    const unitPrices = await UnitPrice.find({
      farmWasteId: { $in: farmWasteIds }
    }).lean();
    
    // Group products by store
    const productsByStore = [];
    
    for (const storeItem of stores) {
      // Find farm wastes for this store
      const storeWastes = farmWastes.filter(
        waste => waste.storeId.toString() === storeItem._id.toString()
      );
      
      // Map farm wastes with their unit prices
      const productsWithDetails = storeWastes.map(waste => {
        const wasteUnitPrices = unitPrices.filter(
          price => price.farmWasteId.toString() === waste._id.toString()
        );
        
        return {
          _id: waste._id,
          wasteName: waste.wasteName,
          description: waste.description,
          averageRating: waste.averageRating,
          imageUrls: waste.imageUrls,
          createdAt: waste.createdAt,
          updatedAt: waste.updatedAt,
          store: {
            _id: storeItem._id,
            storeName: storeItem.storeName,
            description: storeItem.description,
            averageRating: storeItem.averageRating
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
      
      productsByStore.push({
        store: storeItem,
        products: productsWithDetails
      });
    }

    response.sendSuccess(res, {
      count: productsByStore.length,
      data: productsByStore,
      message: "Store products retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error fetching store products:", error);
    response.sendInternalError(res, error.message || "Failed to fetch store products");
  }
};

// // Update a store
// const updateStore = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { id } = req.params;
//     const { storeName, description } = req.body;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       response.sendBadRequest(res, "Invalid store ID");
//       return;
//     }

//     const store = await Store.findById(id);
    
//     if (!store) {
//       response.sendNotFound(res, "Store not found");
//       return;
//     }

//     const updatedStore = await Store.findByIdAndUpdate(
//       id,
//       {
//         storeName,
//         description,
//         updatedAt: new Date(),
//       },
//       { new: true }
//     );

//     response.sendSuccess(res, {
//       data: updatedStore,
//       message: "Store updated successfully",
//     });
//   } catch (error: any) {
//     console.error("Error updating store:", error);
//     response.sendInternalError(res, error.message || "Failed to update store");
//   }
// };

// // Delete a store
// const deleteStore = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { id } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       response.sendBadRequest(res, "Invalid store ID");
//       return;
//     }

//     const store = await Store.findById(id);
    
//     if (!store) {
//       response.sendNotFound(res, "Store not found");
//       return;
//     }

//     // Find all farm wastes for this store
//     const farmWastes = await FarmWaste.find({ storeId: id });
//     const farmWasteIds = farmWastes.map(waste => waste._id);
    
//     // Delete all unit prices for these farm wastes
//     await UnitPrice.deleteMany({ farmWasteId: { $in: farmWasteIds } });
    
//     // Delete all farm wastes for this store
//     await FarmWaste.deleteMany({ storeId: id });

//     // Delete the store
//     await Store.findByIdAndDelete(id);

//     response.sendSuccess(res, {
//       message: "Store and all its products deleted successfully",
//     });
//   } catch (error: any) {
//     console.error("Error deleting store:", error);
//     response.sendInternalError(res, error.message || "Failed to delete store");
//   }
// };

export default {
  createStore,
  // getAllStores,
  // getStoreById,
  getStoreProducts,
  // updateStore,
  // deleteStore,
};

