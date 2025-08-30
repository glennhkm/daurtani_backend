import { Request, Response } from "express";
import { Store, IStore } from "../models/storeModel";
import { FarmWaste, IFarmWaste } from "../models/farmWasteModel";
import { UnitPrice, IUnitPrice } from "../models/unitPriceModel";
import mongoose from "mongoose";
import response from "../libs/utils/responses";

// Define AuthRequest interface to include user property
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName: string;
    supabaseId: string;
  };
}

// Create a new store
const createStore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { 
      storeName, 
      provinsi, 
      kota, 
      kecamatan, 
      detailAlamat, 
      description, 
      whatsAppNumber, 
      instagram, 
      facebook, 
      officialWebsite 
    } = req.body;
    const ownerId = req.user?.id; // Get user ID from authenticated request
    
    if (!ownerId) {
      return response.sendUnauthorized(res, "User not authenticated");
    }

    if (!storeName) {
      return response.sendBadRequest(res, "Store name is required");
    }

    const newStore = await Store.create({
      ownerId,
      storeName,
      provinsi,
      kota,
      kecamatan,
      detailAlamat,
      description,
      whatsAppNumber,
      instagram,
      facebook,
      officialWebsite,
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

    // 1) Ambil toko milik user (hanya field yang dibutuhkan)
    const stores = await Store.find(
      { ownerId },
      "_id storeName description averageRating provinsi kota kecamatan detailAlamat whatsAppNumber instagram facebook officialWebsite"
    ).lean();

    if (!stores || stores.length === 0) {
      response.sendSuccess(res, { data: [], message: "Tidak ada toko yang ditemukan" });
      return;
    }

    const storeIds = stores.map((s: any) => s._id);

    // 2) Ambil farm wastes untuk toko-toko tsb + populate categories (_id, name) saja
    const farmWastes = await FarmWaste.find(
      { storeId: { $in: storeIds } },
      "_id storeId wasteName description averageRating categories imageUrls createdAt updatedAt"
    )
      .populate({ path: "categories", select: "_id name", model: "Category" })
      .lean();

    // 3) Ambil UnitPrice untuk semua farm waste (sekali kueri)
    const farmWasteIds = farmWastes.map((w: any) => w._id);
    const unitPrices = await UnitPrice.find(
      { farmWasteId: { $in: farmWasteIds } },
      "_id farmWasteId unit pricePerUnit isBaseUnit stock equalWith"
    ).lean();

    // 4) Indexing: group UnitPrice by farmWasteId
    const unitPricesByWaste = unitPrices.reduce((acc: Record<string, any[]>, p: any) => {
      const key = p.farmWasteId.toString();
      (acc[key] ||= []).push({
        _id: p._id,
        unit: p.unit,
        pricePerUnit: p.pricePerUnit,
        isBaseUnit: p.isBaseUnit,
        stock: p.stock,
        equalWith: p.equalWith,
      });
      return acc;
    }, {});

    // 5) Indexing: group FarmWaste by storeId
    const wastesByStore = farmWastes.reduce((acc: Record<string, any[]>, w: any) => {
      const key = w.storeId.toString();
      (acc[key] ||= []).push(w);
      return acc;
    }, {});

    // 6) Bangun respons per store
    const productsByStore = stores.map((storeItem: any) => {
      const storeWastes: any[] = wastesByStore[storeItem._id.toString()] || [];

      const productsWithDetails = storeWastes.map((waste: any) => ({
        _id: waste._id,
        wasteName: waste.wasteName,
        description: waste.description,
        averageRating: waste.averageRating,
        // categories sudah hasil populate -> pastikan hanya { _id, name }
        categories: (waste.categories || [])
          .filter(Boolean)
          .map((c: any) => ({ _id: c._id, name: c.name })),
        provinsi: storeItem.provinsi,
        kota: storeItem.kota,
        kecamatan: storeItem.kecamatan,
        detailAlamat: storeItem.detailAlamat,
        whatsAppNumber: storeItem.whatsAppNumber,
        instagram: storeItem.instagram,
        facebook: storeItem.facebook,
        officialWebsite: storeItem.officialWebsite,
        imageUrls: waste.imageUrls,
        createdAt: waste.createdAt,
        updatedAt: waste.updatedAt,
        store: {
          _id: storeItem._id,
          storeName: storeItem.storeName,
          description: storeItem.description,
          averageRating: storeItem.averageRating,
        },
        unitPrices: unitPricesByWaste[waste._id.toString()] || [],
      }));

      return { store: storeItem, products: productsWithDetails };
    });

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
const updateStore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { 
      storeName, 
      provinsi, 
      kota, 
      kecamatan, 
      detailAlamat, 
      description, 
      whatsAppNumber, 
      instagram, 
      facebook, 
      officialWebsite 
    } = req.body;
    const userId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      response.sendBadRequest(res, "Invalid store ID");
      return;
    }

    const store = await Store.findById(id);
    
    if (!store) {
      response.sendNotFound(res, "Toko tidak ditemukan");
      return;
    }

    // Check if the user is the owner of the store    
    if (store.ownerId.toString() !== userId?.toString()) {
      response.sendUnauthorized(res, "Hanya pemilik toko yang dapat mengubah data toko");
      return;
    }

    if (!storeName) {
      return response.sendBadRequest(res, "Nama toko diperlukan");
    }

    const updatedStore = await Store.findByIdAndUpdate(
      id,
      {
        storeName,
        provinsi,
        kota,
        kecamatan,
        detailAlamat,
        description,
        whatsAppNumber,
        instagram,
        facebook,
        officialWebsite,
        updatedAt: new Date(),
      },
      { new: true }
    );

    response.sendSuccess(res, {
      data: updatedStore,
      message: "Store updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating store:", error);
    response.sendInternalError(res, error.message || "Failed to update store");
  }
};

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
  updateStore,
  // deleteStore,
};

