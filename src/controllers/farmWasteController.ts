// controllers/farmWasteController.ts
import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { FarmWaste } from "../models/farmWasteModel";
import { UnitPrice } from "../models/unitPriceModel";
import { Store } from "../models/storeModel";
import { Category } from "../models/categoryModel";
import { CartItem } from "../models/cartItemModel";
import { Review } from "../models/reviewModel";
import response from "../libs/utils/responses";
import { embedQuery } from "../libs/services/productVectorSearch/embedding";

// ========= Util kecil =========
const toSlug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

async function uniqueSlug(base: string): Promise<string> {
  // jika slug bentrok → tambahkan -2, -3, ...
  let slug = toSlug(base);
  let suffix = 2;
  while (await FarmWaste.findOne({ slug }).lean()) {
    slug = `${toSlug(base)}-${suffix++}`;
  }
  return slug;
}

function normStringArray(input: any): string[] | undefined {
  if (!input) return undefined;
  if (Array.isArray(input)) {
    return input
      .map((x) => String(x).trim().toLowerCase())
      .filter((x) => x.length > 0);
  }
  // jika string "a,b,c"
  return String(input)
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0);
}

function normObjectIdArray(input: any): Types.ObjectId[] | undefined {
  if (!input) return undefined;
  const arr = Array.isArray(input) ? input : String(input).split(",");
  const ids = arr
    .map((x) => String(x).trim())
    .filter((x) => x.length > 0)
    .map((x) => new Types.ObjectId(x));
  return ids;
}

/**
 * Hitung stok ringkas pada level produk (opsional),
 * misal: jumlah total stok dari semua unit.
 */
async function aggregateProductStock(farmWasteId: Types.ObjectId): Promise<number> {
  const stocks = await UnitPrice.aggregate([
    { $match: { farmWasteId } },
    { $group: { _id: "$farmWasteId", total: { $sum: { $ifNull: ["$stock", 0] } } } },
  ]);
  return stocks?.[0]?.total ?? 0;
}

/**
 * Buat embedding dari konten produk.
 */
async function buildEmbeddingBasis(doc: {
  wasteName: string;
  description?: string;
  tags?: string[];
  species?: string[];
  use_cases?: string[];
}) {
  const basis = [
    doc.wasteName,
    doc.description || "",
    ...(doc.tags || []),
    ...(doc.species || []),
    ...(doc.use_cases || []),
  ]
    .join("\n")
    .trim();
  if (!basis) return [];
  try {
    const vec = await embedQuery(basis); // ← PERBAIKAN: tambah await
    return Array.isArray(vec) ? vec : [];
  } catch (error) {
    console.error("Error generating embedding:", error);
    // jangan gagalkan create/update kalau embedding error
    return [];
  }
}

// ========= Controller =========

// Create a new farm waste product
const createFarmWaste = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      storeId,
      wasteName,
      description,
      unitPrices,
      imageUrls,
      categoryIds, // array ObjectId (string) atau string "id1,id2"
      tags,
      species,
      use_cases,
    } = req.body;

    // Validate store exists
    const storeExists = await Store.findById(storeId);
    if (!storeExists) {
      response.sendNotFound(res, "Store not found");
      return;
    }

    // Slug unik
    const slug = await uniqueSlug(wasteName);

    // Normalisasi arrays
    const normTags = normStringArray(tags) || [];
    const normSpecies = normStringArray(species) || [];
    const normUseCases = normStringArray(use_cases) || [];
    const normCategories = normObjectIdArray(categoryIds) || [];

    // Buat dokumen awal (tanpa vector dahulu)
    const newFarmWaste = await FarmWaste.create({
      storeId,
      wasteName,
      slug,
      description,
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      averageRating: 0,
      categories: normCategories,
      tags: normTags,
      species: normSpecies,
      use_cases: normUseCases,
      vector: [], // akan diisi setelah embed
    });

    // Tambah unit prices jika ada
    if (unitPrices && Array.isArray(unitPrices)) {
      const hasBaseUnit = unitPrices.some((unit) => unit.isBaseUnit === true);
      if (!hasBaseUnit) {
        await FarmWaste.findByIdAndDelete(newFarmWaste._id);
        response.sendBadRequest(res, "At least one base unit must be provided");
        return;
      }

      const unitPricePromises = unitPrices.map((unit: any) => {
        if (unit.isBaseUnit) {
          unit.equalWith = 1;
        } else if (!unit.equalWith || unit.equalWith <= 0) {
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

    // Stock agregat (opsional)
    const totalStock = await aggregateProductStock(new Types.ObjectId(String(newFarmWaste._id)));
    if (typeof totalStock === "number") {
      await FarmWaste.findByIdAndUpdate(newFarmWaste._id, { stock: totalStock });
    }

    // Generate embedding → update vector
    const vector = await buildEmbeddingBasis({
      wasteName,
      description,
      tags: normTags,
      species: normSpecies,
      use_cases: normUseCases,
    });
    if (vector.length) {
      await FarmWaste.findByIdAndUpdate(newFarmWaste._id, { vector });
    }

    // Return (sekalian ambil unit prices)
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

    const farmWasteIds = farmWastes.map((waste) => waste._id);
    const unitPrices = await UnitPrice.find({ farmWasteId: { $in: farmWasteIds } });

    const storeIds = farmWastes.map((waste) => waste.storeId);
    const stores = await Store.find({ _id: { $in: storeIds } });

    const allCategoryIds = farmWastes.flatMap((waste) => waste.categories || []);
    const categories = await Category.find({ _id: { $in: allCategoryIds } });

    const farmWastesWithDetails = farmWastes.map((waste) => {
      const wasteUnitPrices = unitPrices.filter(
        (price) => String(price.farmWasteId) === String(waste._id)
      );

      const store = stores.find((s) => String(s._id) === String(waste.storeId));

      const wasteCategories = categories.filter((category) =>
        (waste.categories || []).some((catId) => String(catId) === String(category._id))
      );

      return {
        _id: waste._id,
        wasteName: waste.wasteName,
        slug: waste.slug,
        description: waste.description,
        imageUrls: waste.imageUrls,
        averageRating: waste.averageRating,
        stock: waste.stock ?? null,
        tags: waste.tags ?? [],
        species: waste.species ?? [],
        use_cases: waste.use_cases ?? [],
        createdAt: waste.createdAt,
        updatedAt: waste.updatedAt,
        store: store && {
          _id: store._id,
          storeName: store.storeName,
          provinsi: store.provinsi,
          kota: store.kota,
          kecamatan: store.kecamatan,
          detailAlamat: store.detailAlamat,
        },
        categories: wasteCategories.map((category) => ({
          _id: category._id,
          name: category.name,
        })),
        unitPrices: wasteUnitPrices.map((price) => ({
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
      console.log("ERROR 1")
      response.sendNotFound(res, "Farm waste not found");
      return;
    }

    const unitPrices = await UnitPrice.find({ farmWasteId: id });
    const store = await Store.findById(farmWaste.storeId);
    const categories = await Category.find({ _id: { $in: farmWaste.categories || [] } });

    response.sendSuccess(res, {
      data: {
        _id: farmWaste._id,
        wasteName: farmWaste.wasteName,
        description: farmWaste.description,
        slug: farmWaste.slug,
        imageUrls: farmWaste.imageUrls,
        averageRating: farmWaste.averageRating,
        stock: farmWaste.stock ?? null,
        tags: farmWaste.tags ?? [],
        species: farmWaste.species ?? [],
        use_cases: farmWaste.use_cases ?? [],
        createdAt: farmWaste.createdAt,
        updatedAt: farmWaste.updatedAt,
        store: store && {
          _id: store._id,
          storeName: store.storeName,
          averageRating: store.averageRating,
          provinsi: store.provinsi,
          kota: store.kota,
          kecamatan: store.kecamatan,
          detailAlamat: store.detailAlamat,
          whatsAppNumber: store.whatsAppNumber,
          instagram: store.instagram,
          facebook: store.facebook,
          officialWebsite: store.officialWebsite,
        },
        categories: categories.map((category) => ({
          _id: category._id,
          name: category.name,
        })),
        unitPrices: unitPrices.map((price) => ({
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

// Get a single farm waste product by slug
const getFarmWasteBySlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;

    const farmWaste = await FarmWaste.findOne({ slug });
    if (!farmWaste) {
      response.sendNotFound(res, "Farm waste not found");
      return;
    }

    const unitPrices = await UnitPrice.find({ farmWasteId: farmWaste._id });
    const store = await Store.findById(farmWaste.storeId);
    const categories = await Category.find({ _id: { $in: farmWaste.categories || [] } });

    response.sendSuccess(res, {
      data: {
        _id: farmWaste._id,
        wasteName: farmWaste.wasteName,
        description: farmWaste.description,
        slug: farmWaste.slug,
        imageUrls: farmWaste.imageUrls,
        averageRating: farmWaste.averageRating,
        stock: farmWaste.stock ?? null,
        tags: farmWaste.tags ?? [],
        species: farmWaste.species ?? [],
        use_cases: farmWaste.use_cases ?? [],
        createdAt: farmWaste.createdAt,
        updatedAt: farmWaste.updatedAt,
        store: store && {
          _id: store._id,
          storeName: store.storeName,
          averageRating: store.averageRating,
          provinsi: store.provinsi,
          kota: store.kota,
          kecamatan: store.kecamatan,
          detailAlamat: store.detailAlamat,
          whatsAppNumber: store.whatsAppNumber,
          instagram: store.instagram,
          facebook: store.facebook,
          officialWebsite: store.officialWebsite,
        },
        categories: categories.map((category) => ({
          _id: category._id,
          name: category.name,
        })),
        unitPrices: unitPrices.map((price) => ({
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
    const {
      wasteName,
      description,
      imageUrls,
      unitPrices,
      categories,
      tags,
      species,
      use_cases,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      response.sendBadRequest(res, "Invalid farm waste ID");
      return;
    }

    const farmWaste = await FarmWaste.findById(id);
    if (!farmWaste) {
      response.sendNotFound(res, "Farm waste not found");
      return;
    }

    // Normalisasi arrays (jika dikirim)
    const normTags = normStringArray(tags);
    const normSpecies = normStringArray(species);
    const normUseCases = normStringArray(use_cases);
    const normCategories = normObjectIdArray(categories);

    // Deteksi perubahan konten yang memicu re-embed
    const willChangeName = typeof wasteName === "string" && wasteName !== farmWaste.wasteName;
    const willChangeDesc = typeof description === "string" && description !== farmWaste.description;
    const willChangeTags =
      Array.isArray(normTags) &&
      normTags.join(",") !== (farmWaste.tags || []).join(",");
    const willChangeSpecies =
      Array.isArray(normSpecies) &&
      normSpecies.join(",") !== (farmWaste.species || []).join(",");
    const willChangeUseCases =
      Array.isArray(normUseCases) &&
      normUseCases.join(",") !== (farmWaste.use_cases || []).join(",");
    const shouldReEmbed = willChangeName || willChangeDesc || willChangeTags || willChangeSpecies || willChangeUseCases;

    // Jika ganti nama → pastikan slug tetap unik (opsional)
    let updateSlug: string | undefined;
    if (willChangeName) {
      updateSlug = await uniqueSlug(wasteName as string);
    }

    // Update farm waste details
    const patch: any = {
      updatedAt: new Date(),
    };
    if (typeof wasteName === "string") patch.wasteName = wasteName;
    if (typeof description === "string") patch.description = description;
    if (Array.isArray(imageUrls)) patch.imageUrls = imageUrls;
    if (normCategories) patch.categories = normCategories;
    if (normTags) patch.tags = normTags;
    if (normSpecies) patch.species = normSpecies;
    if (normUseCases) patch.use_cases = normUseCases;
    if (updateSlug) patch.slug = updateSlug;

    const updatedFarmWaste = await FarmWaste.findByIdAndUpdate(id, patch, { new: true });

    // Update unit prices jika dikirim
    if (unitPrices && Array.isArray(unitPrices)) {
      const hasBaseUnit = unitPrices.some((unit) => unit.isBaseUnit === true);
      if (!hasBaseUnit) {
        response.sendBadRequest(res, "At least one base unit must be provided");
        return;
      }

      await UnitPrice.deleteMany({ farmWasteId: id });

      const unitPricePromises = unitPrices.map((unit: any) => {
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

      // Perbarui stock agregat
      const totalStock = await aggregateProductStock(new Types.ObjectId(id));
      await FarmWaste.findByIdAndUpdate(id, { stock: totalStock });
    }

    // Re-embed jika perlu
    if (shouldReEmbed && updatedFarmWaste) {
      const vec = await buildEmbeddingBasis({
        wasteName: updatedFarmWaste.wasteName,
        description: updatedFarmWaste.description || "",
        tags: updatedFarmWaste.tags || [],
        species: updatedFarmWaste.species || [],
        use_cases: updatedFarmWaste.use_cases || [],
      });
      await FarmWaste.findByIdAndUpdate(id, { vector: vec || [] });
    }

    // Ambil unit prices terkini
    const updatedUnitPrices = await UnitPrice.find({ farmWasteId: id });

    response.sendSuccess(res, {
      data: {
        farmWaste: await FarmWaste.findById(id),
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

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Promise.all([
          UnitPrice.deleteMany({ farmWasteId: id }, { session }),
          CartItem.deleteMany({ farmWasteId: id }, { session }),
          Review.deleteMany({ farmWasteId: id }, { session }),
        ]);
        await FarmWaste.findByIdAndDelete(id, { session });
      });
    } finally {
      await session.endSession();
    }

    response.sendSuccess(res, { message: "Farm waste deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting farm waste:", error);
    response.sendInternalError(res, error.message || "Failed to delete farm waste");
  }
};

// Check if string is a valid ObjectId
const isObjectId = (val: string) => mongoose.Types.ObjectId.isValid(val) && String(new mongoose.Types.ObjectId(val)) === val;

// Get a single farm waste product by ID or slug
const getFarmWasteByIdOrSlug = async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;

    const query = isObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: idOrSlug };

    const fw = await FarmWaste.findOne(query);
    if (!fw) {
      console.log("ERROR 22")
      return response.sendNotFound(res, "Farm waste not found")
    };

    // Populate store snapshot
    const store = await Store.findById(fw.storeId, {
      storeName: 1,
      provinsi: 1,
      kota: 1,
      kecamatan: 1,
      detailAlamat: 1,
      description: 1,
      averageRating: 1,
      whatsAppNumber: 1,
      instagram: 1,
      facebook: 1,
      officialWebsite: 1,
      bankName: 1,
      bankAccountNumber: 1,
      bankAccountHolder: 1,
      createdAt: 1,
    });

    // Fetch unit prices for this product
    const unitPrices = await UnitPrice.find(
      { farmWasteId: fw._id },
      {
        unit: 1,
        pricePerUnit: 1,
        isBaseUnit: 1,
        stock: 1,
        equalWith: 1,
      }
    ).sort({ isBaseUnit: -1, pricePerUnit: 1 });

    const data = {
      _id: fw._id,
      wasteName: fw.wasteName,
      slug: fw.slug,
      description: fw.description,
      imageUrls: fw.imageUrls,
      averageRating: fw.averageRating || 0,
      tags: fw.tags,
      species: fw.species,
      use_cases: fw.use_cases,
      createdAt: fw.createdAt,
      updatedAt: fw.updatedAt,
      store,
      unitPrices,
    };

    return response.sendSuccess(res, { data });
  } catch (err: any) {
    console.error("getFarmWasteByIdOrSlug error", err);
    return response.sendInternalError(res, err.message);
  }
};

// Get featured products (random 3 products with good ratings)
export const getFeaturedProducts = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 3;
    
    // Aggregate pipeline to get random featured products
    const featuredProducts = await FarmWaste.aggregate([
      // Join with UnitPrice to get pricing info
      {
        $lookup: {
          from: "unitprices",
          localField: "_id",
          foreignField: "farmWasteId",
          as: "unitPrices"
        }
      },
      // Join with Store to get store info
      {
        $lookup: {
          from: "stores",
          localField: "storeId",
          foreignField: "_id",
          as: "store"
        }
      },
      // Filter products that have unit prices and store
      {
        $match: {
          unitPrices: { $ne: [] },
          store: { $ne: [] },
          imageUrls: { $ne: [] } // Only products with images
        }
      },
      // Add computed fields
      {
        $addFields: {
          store: { $arrayElemAt: ["$store", 0] },
          baseUnitPrice: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$unitPrices",
                  as: "up",
                  cond: { $eq: ["$$up.isBaseUnit", true] }
                }
              },
              0
            ]
          },
          // Calculate average rating (default to 4.5 if no rating)
          displayRating: {
            $ifNull: ["$averageRating", 4.5]
          }
        }
      },
      // Ensure we have base unit price
      {
        $match: {
          baseUnitPrice: { $ne: null }
        }
      },
      // Sample random products
      { $sample: { size: limit } },
      // Project final fields
      {
        $project: {
          _id: 1,
          wasteName: 1,
          description: 1,
          slug: 1,
          imageUrls: 1,
          averageRating: "$displayRating",
          unitPrices: 1,
          "store._id": 1,
          "store.storeName": 1,
          "store.provinsi": 1,
          "store.kota": 1,
          "store.kecamatan": 1,
          categories: 1,
          tags: 1,
          createdAt: 1,
          updatedAt: 1
        }
      }
    ]);

    // Transform data to match frontend expectations
    const transformedProducts = featuredProducts.map(product => ({
      ...product,
      // Add featured flag
      featured: true
    }));

    return response.sendSuccess(res, {
      data: transformedProducts,
      message: "Featured products retrieved successfully"
    });

  } catch (err: any) {
    console.error("Error getting featured products:", err);
    return response.sendInternalError(res, err.message);
  }
};

export default {
  createFarmWaste,
  getAllFarmWastes,
  getFarmWasteById,
  getFarmWasteBySlug,
  updateFarmWaste,
  deleteFarmWaste,
  getFarmWasteByIdOrSlug,
  getFeaturedProducts, // added
};