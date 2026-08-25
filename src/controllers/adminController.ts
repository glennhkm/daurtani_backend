import { Request, Response } from "express";
import mongoose from "mongoose";
import { Transaction } from "../models/transactionModel";
import { User } from "../models/userModel";
import { Store } from "../models/storeModel";
import { FarmWaste } from "../models/farmWasteModel";
import { UnitPrice } from "../models/unitPriceModel";
import response from "../libs/utils/responses";

// GET /admin/stats - Dashboard metric summary
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const [
      totalTransactions,
      totalUsers,
      totalStores,
      totalProducts,
      statusCounts,
      revenueResult,
      paidRevenueResult,
      recentTransactions,
    ] = await Promise.all([
      Transaction.countDocuments(),
      User.countDocuments(),
      Store.countDocuments(),
      FarmWaste.countDocuments(),
      Transaction.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Transaction.aggregate([
        { $match: { status: { $in: ["paid", "completed"] } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Transaction.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("userId", "fullName email phoneNumber"),
    ]);

    const statusMap: Record<string, number> = {
      pending: 0,
      paid: 0,
      completed: 0,
      cancelled: 0,
      expired: 0,
      failed: 0,
      refunded: 0,
    };

    statusCounts.forEach((s: { _id: string; count: number }) => {
      if (s._id) statusMap[s._id] = s.count;
    });

    const totalGMV = revenueResult[0]?.total || 0;
    const paidGMV = paidRevenueResult[0]?.total || 0;

    return response.sendSuccess(res, {
      data: {
        totalTransactions,
        totalUsers,
        totalStores,
        totalProducts,
        totalGMV,
        paidGMV,
        statusCounts: statusMap,
        recentTransactions,
      },
      message: "Dashboard stats retrieved successfully",
    });
  } catch (err: any) {
    console.error("getDashboardStats error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// GET /admin/transactions - Get all transactions with search, filter & pagination
export const getAllTransactions = async (req: Request, res: Response) => {
  try {
    const {
      status,
      search,
      page = "1",
      limit = "50",
      sortBy = "createdAt",
      sortOrder = "-1",
    } = req.query;

    const filter: any = {};

    if (status && typeof status === "string" && status !== "all") {
      filter.status = status;
    }

    if (search && typeof search === "string" && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { orderId: searchRegex },
        { "items.wasteName": searchRegex },
        { "items.storeName": searchRegex },
        { "shippingAddress.fullAddress": searchRegex },
        { "shippingAddress.district": searchRegex },
        { "shippingAddress.regency": searchRegex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string) || 50));
    const skip = (pageNum - 1) * limitNum;
    const sortDirection = sortOrder === "1" || sortOrder === "asc" ? 1 : -1;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ [sortBy as string]: sortDirection })
        .skip(skip)
        .limit(limitNum)
        .populate("userId", "fullName email phoneNumber"),
      Transaction.countDocuments(filter),
    ]);

    return response.sendSuccess(res, {
      data: transactions,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      message: "Transactions retrieved successfully",
    });
  } catch (err: any) {
    console.error("getAllTransactions error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// GET /admin/transactions/:orderId - Detail single transaction for admin
export const getTransactionDetail = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const tx = await Transaction.findOne({ orderId }).populate(
      "userId",
      "fullName email phoneNumber provinsi kota kecamatan detailAlamat"
    );

    if (!tx) {
      return response.sendNotFound(res, "Transaksi tidak ditemukan");
    }

    return response.sendSuccess(res, {
      data: tx,
      message: "Detail transaksi berhasil diambil",
    });
  } catch (err: any) {
    console.error("getTransactionDetail error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// PATCH /admin/transactions/:orderId/status - Update transaction status by admin
export const updateTransactionStatusByAdmin = async (
  req: Request,
  res: Response
) => {
  try {
    const { orderId } = req.params;
    const { status, note } = req.body;

    const allowedStatuses = [
      "pending",
      "paid",
      "completed",
      "cancelled",
      "expired",
      "failed",
      "refunded",
    ];

    if (!allowedStatuses.includes(status)) {
      return response.sendBadRequest(
        res,
        `Status tidak valid. Pilihan: ${allowedStatuses.join(", ")}`
      );
    }

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === "paid") {
      updateData.paidAt = new Date();
    } else if (status === "cancelled") {
      updateData.cancelledAt = new Date();
    }

    if (note) {
      updateData["metadata.adminNote"] = note;
    }

    const tx = await Transaction.findOneAndUpdate({ orderId }, updateData, {
      new: true,
    }).populate("userId", "fullName email phoneNumber");

    if (!tx) {
      return response.sendNotFound(res, "Transaksi tidak ditemukan");
    }

    return response.sendSuccess(res, {
      data: tx,
      message: `Status transaksi berhasil diperbarui menjadi ${status}`,
    });
  } catch (err: any) {
    console.error("updateTransactionStatusByAdmin error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// GET /admin/users - List all users with activity counts
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { search, role, page = "1", limit = "50" } = req.query;

    const filter: any = {};

    if (role && typeof role === "string" && role !== "all") {
      filter.role = role;
    }

    if (search && typeof search === "string" && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      User.countDocuments(filter),
    ]);

    // Aggregate transaction counts and stores for these users
    const userIds = users.map((u) => u._id);
    const [stores, txCounts] = await Promise.all([
      Store.find({
        ownerId: { $in: userIds },
      }),
      Transaction.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 }, totalSpent: { $sum: "$totalAmount" } } },
      ]),
    ]);

    const txMap = new Map(txCounts.map((t) => [String(t._id), t]));
    const storeMap = new Map(stores.map((s) => [String(s.ownerId), s]));

    const usersWithStats = users.map((u) => {
      const tx = txMap.get(String(u._id));
      const store = storeMap.get(String(u._id));
      return {
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        phoneNumber: u.phoneNumber,
        role: u.role || "user",
        provinsi: u.provinsi,
        kota: u.kota,
        kecamatan: u.kecamatan,
        detailAlamat: u.detailAlamat,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        hasStore: !!store,
        storeName: store?.storeName || null,
        transactionCount: tx?.count || 0,
        totalSpent: tx?.totalSpent || 0,
      };
    });

    return response.sendSuccess(res, {
      data: usersWithStats,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      message: "Users retrieved successfully",
    });
  } catch (err: any) {
    console.error("getAllUsers error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// GET /admin/users/:id - Get single user detail with recent transactions
export const getUserDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.sendBadRequest(res, "ID User tidak valid");
    }

    const [user, store, transactions] = await Promise.all([
      User.findById(id),
      Store.findOne({ ownerId: id }),
      Transaction.find({ userId: id }).sort({ createdAt: -1 }),
    ]);

    if (!user) {
      return response.sendNotFound(res, "User tidak ditemukan");
    }

    return response.sendSuccess(res, {
      data: {
        user,
        store,
        transactions,
        totalTransactions: transactions.length,
        totalSpent: transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0),
      },
      message: "Detail user berhasil diambil",
    });
  } catch (err: any) {
    console.error("getUserDetail error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// ==========================================
// STORE MANAGEMENT
// ==========================================

// GET /admin/stores - List all stores with metrics
export const getAllStores = async (req: Request, res: Response) => {
  try {
    const { search, page = "1", limit = "20" } = req.query;

    const filter: any = {};
    if (search && typeof search === "string" && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { storeName: regex },
        { description: regex },
        { "provinsi.name": regex },
        { "kota.name": regex },
        { "kecamatan.name": regex },
        { detailAlamat: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [stores, total] = await Promise.all([
      Store.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("ownerId", "fullName email phoneNumber role"),
      Store.countDocuments(filter),
    ]);

    const storeIds = stores.map((s) => s._id);

    // Aggregate product counts and sales for these stores
    const [productCounts, salesStats] = await Promise.all([
      FarmWaste.aggregate([
        { $match: { storeId: { $in: storeIds } } },
        {
          $group: {
            _id: "$storeId",
            totalProducts: { $sum: 1 },
            activeProducts: {
              $sum: { $cond: [{ $eq: ["$isDeleted", true] }, 0, 1] },
            },
          },
        },
      ]),
      Transaction.aggregate([
        { $unwind: "$items" },
        { $match: { "items.storeId": { $in: storeIds } } },
        {
          $group: {
            _id: "$items.storeId",
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$items.total" },
          },
        },
      ]),
    ]);

    const productMap = new Map(productCounts.map((p) => [String(p._id), p]));
    const salesMap = new Map(salesStats.map((s) => [String(s._id), s]));

    const storesWithStats = stores.map((s) => {
      const p = productMap.get(String(s._id));
      const sl = salesMap.get(String(s._id));

      return {
        _id: s._id,
        storeName: s.storeName,
        description: s.description,
        owner: s.ownerId,
        provinsi: s.provinsi,
        kota: s.kota,
        kecamatan: s.kecamatan,
        detailAlamat: s.detailAlamat,
        whatsAppNumber: s.whatsAppNumber,
        bankName: s.bankName,
        bankAccountNumber: s.bankAccountNumber,
        bankAccountHolder: s.bankAccountHolder,
        averageRating: s.averageRating || 5.0,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        totalProducts: p?.totalProducts || 0,
        activeProducts: p?.activeProducts || 0,
        totalOrders: sl?.totalOrders || 0,
        totalRevenue: sl?.totalRevenue || 0,
      };
    });

    return response.sendSuccess(res, {
      data: storesWithStats,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      message: "Stores retrieved successfully",
    });
  } catch (err: any) {
    console.error("getAllStores error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// GET /admin/stores/:id - Single store detail
export const getStoreDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.sendBadRequest(res, "ID Toko tidak valid");
    }

    const store = await Store.findById(id).populate("ownerId", "fullName email phoneNumber role");
    if (!store) {
      return response.sendNotFound(res, "Toko tidak ditemukan");
    }

    const [products, transactions] = await Promise.all([
      FarmWaste.find({ storeId: id }).sort({ createdAt: -1 }),
      Transaction.find({ "items.storeId": id }).sort({ createdAt: -1 }).populate("userId", "fullName email"),
    ]);

    const productIds = products.map((p) => p._id);
    const unitPrices = await UnitPrice.find({ farmWasteId: { $in: productIds } });

    const productsWithUnits = products.map((p) => {
      const units = unitPrices.filter((u) => String(u.farmWasteId) === String(p._id));
      return {
        ...p.toObject(),
        unitPrices: units,
      };
    });

    const totalRevenue = transactions.reduce((sum, t) => {
      const storeItems = t.items.filter((item) => String(item.storeId) === String(id));
      return sum + storeItems.reduce((iSum, i) => iSum + (i.total || 0), 0);
    }, 0);

    return response.sendSuccess(res, {
      data: {
        store,
        products: productsWithUnits,
        transactions,
        totalProducts: products.length,
        activeProducts: products.filter((p) => !p.isDeleted).length,
        totalOrders: transactions.length,
        totalRevenue,
      },
      message: "Detail toko berhasil diambil",
    });
  } catch (err: any) {
    console.error("getStoreDetail error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// ==========================================
// PRODUCT MANAGEMENT & SOFT DELETE
// ==========================================

// GET /admin/products - List all products with filter & search
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const { search, status = "all", storeId, page = "1", limit = "20" } = req.query;

    const filter: any = {};

    if (status === "active") {
      filter.isDeleted = { $ne: true };
    } else if (status === "deleted") {
      filter.isDeleted = true;
    }

    if (storeId && mongoose.Types.ObjectId.isValid(storeId as string)) {
      filter.storeId = storeId;
    }

    if (search && typeof search === "string" && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { wasteName: regex },
        { description: regex },
        { tags: regex },
        { species: regex },
        { use_cases: regex },
        { slug: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      FarmWaste.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("storeId", "storeName provinsi kota kecamatan detailAlamat whatsAppNumber"),
      FarmWaste.countDocuments(filter),
    ]);

    const productIds = products.map((p) => p._id);
    const unitPrices = await UnitPrice.find({ farmWasteId: { $in: productIds } });

    const productsWithDetails = products.map((p) => {
      const units = unitPrices.filter((u) => String(u.farmWasteId) === String(p._id));
      const baseUnit = units.find((u) => u.isBaseUnit) || units[0];

      return {
        _id: p._id,
        wasteName: p.wasteName,
        slug: p.slug,
        description: p.description,
        imageUrls: p.imageUrls,
        averageRating: p.averageRating || 5.0,
        stock: p.stock ?? null,
        tags: p.tags || [],
        species: p.species || [],
        use_cases: p.use_cases || [],
        isDeleted: !!p.isDeleted,
        deletedAt: p.deletedAt || null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        store: p.storeId,
        unitPrices: units,
        basePrice: baseUnit?.pricePerUnit || 0,
        baseUnit: baseUnit?.unit || "Kg",
      };
    });

    return response.sendSuccess(res, {
      data: productsWithDetails,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      message: "Products retrieved successfully",
    });
  } catch (err: any) {
    console.error("getAllProducts error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// GET /admin/products/:id - Single product detail
export const getProductDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.sendBadRequest(res, "ID Produk tidak valid");
    }

    const product = await FarmWaste.findById(id).populate("storeId");
    if (!product) {
      return response.sendNotFound(res, "Produk tidak ditemukan");
    }

    const unitPrices = await UnitPrice.find({ farmWasteId: id });
    const transactions = await Transaction.find({ "items.productId": id })
      .sort({ createdAt: -1 })
      .populate("userId", "fullName email");

    return response.sendSuccess(res, {
      data: {
        product,
        unitPrices,
        transactions,
        totalSoldQuantity: transactions.reduce((sum, t) => {
          const items = t.items.filter((i) => String(i.productId) === String(id));
          return sum + items.reduce((iSum, i) => iSum + (i.quantity || 0), 0);
        }, 0),
        totalSalesRevenue: transactions.reduce((sum, t) => {
          const items = t.items.filter((i) => String(i.productId) === String(id));
          return sum + items.reduce((iSum, i) => iSum + (i.total || 0), 0);
        }, 0),
      },
      message: "Detail produk berhasil diambil",
    });
  } catch (err: any) {
    console.error("getProductDetail error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// PATCH /admin/products/:id/soft-delete - Soft delete or restore product
export const toggleProductSoftDelete = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isDeleted } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.sendBadRequest(res, "ID Produk tidak valid");
    }

    const product = await FarmWaste.findById(id);
    if (!product) {
      return response.sendNotFound(res, "Produk tidak ditemukan");
    }

    // Determine target delete state (toggle if not specified)
    const targetState = typeof isDeleted === "boolean" ? isDeleted : !product.isDeleted;

    product.isDeleted = targetState;
    product.deletedAt = targetState ? new Date() : null;
    product.updatedAt = new Date();

    await product.save();

    return response.sendSuccess(res, {
      data: product,
      message: targetState
        ? "Produk berhasil dihapus (Soft Delete)."
        : "Produk berhasil dipulihkan (Aktif kembali).",
    });
  } catch (err: any) {
    console.error("toggleProductSoftDelete error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// PUT /admin/products/:id - Full product update by admin
export const updateProductByAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      wasteName,
      slug,
      description,
      imageUrls,
      stock,
      averageRating,
      tags,
      species,
      use_cases,
      isDeleted,
      unitPrices,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.sendBadRequest(res, "ID Produk tidak valid");
    }

    const product = await FarmWaste.findById(id);
    if (!product) {
      return response.sendNotFound(res, "Produk tidak ditemukan");
    }

    if (typeof wasteName === "string" && wasteName.trim()) {
      product.wasteName = wasteName.trim();
    }

    if (typeof slug === "string" && slug.trim() && slug.trim() !== product.slug) {
      const existingSlug = await FarmWaste.findOne({ slug: slug.trim(), _id: { $ne: id } });
      if (existingSlug) {
        return response.sendBadRequest(res, "Slug sudah digunakan oleh produk lain.");
      }
      product.slug = slug.trim();
    }

    if (typeof description === "string") {
      product.description = description;
    }

    if (Array.isArray(imageUrls)) {
      product.imageUrls = imageUrls.filter((url: any) => typeof url === "string" && url.trim().length > 0);
    }

    if (typeof stock === "number" && !isNaN(stock)) {
      product.stock = stock;
    }

    if (typeof averageRating === "number" && !isNaN(averageRating)) {
      product.averageRating = Math.min(5, Math.max(1, averageRating));
    }

    if (Array.isArray(tags)) {
      product.tags = tags.map((t: any) => String(t).trim()).filter(Boolean);
    }

    if (Array.isArray(species)) {
      product.species = species.map((s: any) => String(s).trim()).filter(Boolean);
    }

    if (Array.isArray(use_cases)) {
      product.use_cases = use_cases.map((u: any) => String(u).trim()).filter(Boolean);
    }

    if (typeof isDeleted === "boolean") {
      product.isDeleted = isDeleted;
      product.deletedAt = isDeleted ? new Date() : null;
    }

    product.updatedAt = new Date();
    await product.save();

    // Update unit prices if provided
    if (unitPrices && Array.isArray(unitPrices) && unitPrices.length > 0) {
      await UnitPrice.deleteMany({ farmWasteId: id });

      const pricePromises = unitPrices.map((u: any, idx: number) => {
        return UnitPrice.create({
          farmWasteId: id,
          unit: u.unit || "Kg",
          pricePerUnit: Number(u.pricePerUnit) || 0,
          isBaseUnit: u.isBaseUnit === true || (idx === 0 && !unitPrices.some((x: any) => x.isBaseUnit)),
          stock: Number(u.stock) || product.stock || 0,
          equalWith: Number(u.equalWith) || 1,
          createdAt: product.createdAt,
          updatedAt: new Date(),
        });
      });

      await Promise.all(pricePromises);
    }

    const updatedUnits = await UnitPrice.find({ farmWasteId: id });

    return response.sendSuccess(res, {
      data: {
        product,
        unitPrices: updatedUnits,
      },
      message: "Produk berhasil diperbarui oleh Administrator.",
    });
  } catch (err: any) {
    console.error("updateProductByAdmin error:", err);
    return response.sendInternalError(res, err.message);
  }
};

export default {
  getDashboardStats,
  getAllTransactions,
  getTransactionDetail,
  updateTransactionStatusByAdmin,
  getAllUsers,
  getUserDetail,
  getAllStores,
  getStoreDetail,
  getAllProducts,
  getProductDetail,
  toggleProductSoftDelete,
  updateProductByAdmin,
};


