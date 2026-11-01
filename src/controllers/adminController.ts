import { Request, Response } from "express";
import mongoose from "mongoose";
import { Transaction } from "../models/transactionModel";
import { User } from "../models/userModel";
import { Store } from "../models/storeModel";
import { FarmWaste } from "../models/farmWasteModel";
import { UnitPrice } from "../models/unitPriceModel";
import response from "../libs/utils/responses";
import {
  embedText,
  embedDoc,
  EMBEDDING_DIMENSION,
} from "../libs/services/productVectorSearch/embedding";
import {
  encryptSyncSecret,
  obtainUserSupabaseSession,
} from "./authController";
import {
  issueBackendSessionToken,
  isJwtExpiredOrInvalid,
} from "../libs/utils/sessionToken";
import { sendAdminPasswordResetNoticeEmail } from "../libs/utils/mailjetService";
import { getOrCreateDaurTaniStore } from "../libs/utils/daurtaniStore";

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

async function uniqueSlug(base: string): Promise<string> {
  let slug = toSlug(base);
  let suffix = 2;
  while (await FarmWaste.findOne({ slug }).lean()) {
    slug = `${toSlug(base)}-${suffix++}`;
  }
  return slug;
}

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

// POST /admin/users/:id/reset-password - Reset user password directly by admin
export const resetUserPasswordByAdmin = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const { newPassword, sendEmailNotification = false } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.sendBadRequest(res, "ID Pengguna tidak valid");
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.trim().length < 6) {
      return response.sendBadRequest(
        res,
        "Kata sandi baru minimal harus terdiri dari 6 karakter"
      );
    }

    const cleanPassword = newPassword.trim();
    const user = await User.findById(id);

    if (!user) {
      return response.sendNotFound(res, "Pengguna tidak ditemukan");
    }

    // 1. Attempt to sync new password with Supabase Auth if session exists
    let supabaseSynced = false;
    try {
      const { scopedClient, accessToken } = await obtainUserSupabaseSession(user);
      if (accessToken) {
        const { error: updateErr } = await scopedClient.auth.updateUser({
          password: cleanPassword,
        });

        if (!updateErr) {
          supabaseSynced = true;
          // Refresh session tokens with new password
          const { data: freshSign } = await scopedClient.auth.signInWithPassword({
            email: user.email,
            password: cleanPassword,
          });
          if (freshSign?.session) {
            user.accessToken = freshSign.session.access_token;
            user.refreshToken = freshSign.session.refresh_token;
          }
        } else {
          console.warn("Supabase updateUser notice during admin reset:", updateErr.message);
        }
      }
    } catch (err: any) {
      console.warn("Supabase session sync skipped/failed during admin reset:", err?.message || err);
    }

    // 2. If Supabase session is unavailable or token is invalid, issue guaranteed backend session token
    if (!supabaseSynced || isJwtExpiredOrInvalid(user.accessToken)) {
      const issued = issueBackendSessionToken(user);
      user.accessToken = issued.accessToken;
      user.refreshToken = issued.refreshToken;
    }

    // 3. Update MongoDB user record
    user.authSyncCipher = encryptSyncSecret(cleanPassword);
    user.isEmailVerified = true;
    user.activationTokenHash = null;
    user.activationTokenExpiresAt = null;
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    user.updatedAt = new Date();
    await user.save();

    // 4. Optionally send email notification via Mailjet
    let emailSent = false;
    if (sendEmailNotification && user.email) {
      try {
        await sendAdminPasswordResetNoticeEmail({
          toEmail: user.email,
          fullName: user.fullName || user.email.split("@")[0],
          newPassword: cleanPassword,
        });
        emailSent = true;
      } catch (emailErr: any) {
        console.error("Gagal mengirim email reset password admin ke user:", emailErr?.message || emailErr);
      }
    }

    return response.sendSuccess(res, {
      data: {
        userId: user._id,
        fullName: user.fullName,
        email: user.email,
        emailSent,
        supabaseSynced,
        updatedAt: user.updatedAt,
      },
      message: `Kata sandi untuk pengguna ${user.fullName || user.email} berhasil diperbarui.`,
    });
  } catch (err: any) {
    console.error("resetUserPasswordByAdmin error:", err);
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

/**
 * Standardized embedding text builder for farmwaste products
 */
export function buildProductEmbeddingBasis(doc: {
  wasteName: string;
  description?: string;
  tags?: string[];
  species?: string[];
  use_cases?: string[];
}): string {
  return [
    doc.wasteName || "",
    doc.description || "",
    ...(doc.tags || []),
    ...(doc.species || []),
    ...(doc.use_cases || []),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

// GET /admin/products - List all products with filter & search
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const { search, status = "all", storeId, page = "1", limit = "20" } = req.query;

    const filter: any = {};

    if (status === "active") {
      filter.isDeleted = { $ne: true };
      filter.isActive = { $ne: false };
    } else if (status === "inactive") {
      filter.isDeleted = { $ne: true };
      filter.isActive = false;
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

      const hasVector =
        Array.isArray(p.vector) && p.vector.length === EMBEDDING_DIMENSION;
      const vectorDimensions = Array.isArray(p.vector) ? p.vector.length : 0;

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
        isActive: p.isActive !== false,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        store: p.storeId,
        unitPrices: units,
        basePrice: baseUnit?.pricePerUnit || 0,
        baseUnit: baseUnit?.unit || "Kg",
        hasVector,
        vectorDimensions,
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

    const hasVector =
      Array.isArray(product.vector) &&
      product.vector.length === EMBEDDING_DIMENSION;
    const vectorDimensions = Array.isArray(product.vector)
      ? product.vector.length
      : 0;

    return response.sendSuccess(res, {
      data: {
        product: {
          ...product.toObject(),
          hasVector,
          vectorDimensions,
        },
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
        hasVector,
        vectorDimensions,
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

// PATCH /admin/products/:id/toggle-active - Toggle product active status
export const toggleProductActiveByAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.sendBadRequest(res, "ID Produk tidak valid");
    }

    const product = await FarmWaste.findById(id);
    if (!product) {
      return response.sendNotFound(res, "Produk tidak ditemukan");
    }

    const targetState = typeof isActive === "boolean" ? isActive : product.isActive === false;
    product.isActive = targetState;
    product.updatedAt = new Date();
    await product.save();

    return response.sendSuccess(res, {
      data: { _id: product._id, isActive: product.isActive },
      message: targetState
        ? "Produk berhasil diaktifkan."
        : "Produk berhasil dinonaktifkan.",
    });
  } catch (err: any) {
    console.error("toggleProductActiveByAdmin error:", err);
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
      isActive,
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

    if (typeof isActive === "boolean") {
      product.isActive = isActive;
    }

    // Regenerate vector embedding if semantic fields were provided OR if vector is missing/invalid dimension
    const isVectorInvalid =
      !Array.isArray(product.vector) ||
      product.vector.length !== EMBEDDING_DIMENSION;
    const semanticFieldsChanged =
      typeof wasteName === "string" ||
      typeof description === "string" ||
      Array.isArray(tags) ||
      Array.isArray(species) ||
      Array.isArray(use_cases);

    if (semanticFieldsChanged || isVectorInvalid) {
      try {
        const embeddingText = buildProductEmbeddingBasis({
          wasteName: product.wasteName,
          description: product.description,
          tags: product.tags,
          species: product.species,
          use_cases: product.use_cases,
        });

        if (embeddingText) {
          const newVector = await embedDoc(embeddingText);
          if (
            Array.isArray(newVector) &&
            newVector.length === EMBEDDING_DIMENSION
          ) {
            product.vector = newVector;
          }
        }
      } catch (vecErr) {
        console.warn("Non-fatal: failed to regenerate vector embedding in admin update:", vecErr);
      }
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
    const hasVector =
      Array.isArray(product.vector) &&
      product.vector.length === EMBEDDING_DIMENSION;

    return response.sendSuccess(res, {
      data: {
        product: {
          ...product.toObject(),
          hasVector,
          vectorDimensions: Array.isArray(product.vector)
            ? product.vector.length
            : 0,
        },
        unitPrices: updatedUnits,
      },
      message: "Produk berhasil diperbarui oleh Administrator.",
    });
  } catch (err: any) {
    console.error("updateProductByAdmin error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// POST /admin/products - Create a new product by admin
export const createProductByAdmin = async (req: Request, res: Response) => {
  try {
    const {
      storeId,
      wasteName,
      description,
      imageUrls,
      categories,
      unitPrices,
      tags,
      species,
      use_cases,
      isActive,
    } = req.body;

    if (!wasteName || typeof wasteName !== "string" || !wasteName.trim()) {
      return response.sendBadRequest(res, "Nama produk wajib diisi.");
    }

    // 1. Tentukan target store: jika kosong atau 'daurtani', gunakan toko resmi DaurTani
    let targetStoreId: mongoose.Types.ObjectId;
    let targetStoreName = "DaurTani";

    if (!storeId || storeId === "daurtani" || storeId === "official") {
      const officialStore = await getOrCreateDaurTaniStore();
      targetStoreId = officialStore._id as mongoose.Types.ObjectId;
      targetStoreName = officialStore.storeName;
    } else {
      if (!mongoose.Types.ObjectId.isValid(storeId)) {
        return response.sendBadRequest(res, "ID Toko yang dipilih tidak valid.");
      }
      const existingStore = await Store.findById(storeId);
      if (!existingStore) {
        return response.sendNotFound(res, "Toko yang dipilih tidak ditemukan.");
      }
      targetStoreId = existingStore._id as mongoose.Types.ObjectId;
      targetStoreName = existingStore.storeName;
    }

    // 2. Validasi unit prices
    if (!Array.isArray(unitPrices) || unitPrices.length === 0) {
      return response.sendBadRequest(
        res,
        "Minimal harus ada satu satuan harga (unit price)."
      );
    }

    const hasBaseUnit = unitPrices.some((u: any) => u.isBaseUnit === true);
    if (!hasBaseUnit) {
      unitPrices[0].isBaseUnit = true;
    }

    // 3. Generate unique slug
    const productSlug = await uniqueSlug(wasteName.trim());

    // 4. Normalisasi array fields
    const normTags = Array.isArray(tags)
      ? tags.map((t: any) => String(t).trim().toLowerCase()).filter(Boolean)
      : [];
    const normSpecies = Array.isArray(species)
      ? species.map((s: any) => String(s).trim().toLowerCase()).filter(Boolean)
      : [];
    const normUseCases = Array.isArray(use_cases)
      ? use_cases.map((u: any) => String(u).trim().toLowerCase()).filter(Boolean)
      : [];
    const normCategories = Array.isArray(categories)
      ? categories.filter((c: any) => mongoose.Types.ObjectId.isValid(c))
      : [];
    const normImages = Array.isArray(imageUrls)
      ? imageUrls.filter((img: any) => typeof img === "string" && img.trim())
      : [];

    // 5. Generate vector embedding menggunakan Eden AI
    let vector: number[] = [];
    try {
      const embeddingText = buildProductEmbeddingBasis({
        wasteName: wasteName.trim(),
        description: description || "",
        tags: normTags,
        species: normSpecies,
        use_cases: normUseCases,
      });

      if (embeddingText) {
        vector = await embedDoc(embeddingText);
      }
    } catch (vecErr) {
      console.warn("Non-fatal: Gagal generate embedding saat admin create product:", vecErr);
    }

    // Hitung total stok dari unit prices
    const totalStock = unitPrices.reduce(
      (sum: number, u: any) => sum + (Number(u.stock) || 0),
      0
    );

    // 6. Buat dokumen FarmWaste
    const newProduct = await FarmWaste.create({
      storeId: targetStoreId,
      wasteName: wasteName.trim(),
      slug: productSlug,
      description: description || "",
      imageUrls: normImages,
      categories: normCategories,
      tags: normTags,
      species: normSpecies,
      use_cases: normUseCases,
      stock: totalStock,
      averageRating: 5.0,
      vector,
      isActive: typeof isActive === "boolean" ? isActive : true,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 7. Simpan UnitPrices
    const createdUnitPrices = await Promise.all(
      unitPrices.map((u: any, idx: number) =>
        UnitPrice.create({
          farmWasteId: newProduct._id,
          unit: u.unit?.trim() || "Kg",
          pricePerUnit: Number(u.pricePerUnit) || 0,
          isBaseUnit: u.isBaseUnit === true || (idx === 0 && !hasBaseUnit),
          stock: Number(u.stock) || 0,
          equalWith: Number(u.equalWith) || 1,
          createdAt: newProduct.createdAt,
          updatedAt: new Date(),
        })
      )
    );

    return response.sendCreated(res, {
      data: {
        ...newProduct.toObject(),
        store: { _id: targetStoreId, storeName: targetStoreName },
        unitPrices: createdUnitPrices,
        hasVector: Array.isArray(vector) && vector.length === EMBEDDING_DIMENSION,
      },
      message: "Produk berhasil ditambahkan oleh Administrator.",
    });
  } catch (err: any) {
    console.error("createProductByAdmin error:", err);
    return response.sendInternalError(res, err.message);
  }
};

// POST /admin/products/:id/embed - On-demand generate embedding for single product
export const embedProductByAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.sendBadRequest(res, "ID Produk tidak valid");
    }

    const product = await FarmWaste.findById(id);
    if (!product) {
      return response.sendNotFound(res, "Produk tidak ditemukan");
    }

    const embeddingText = buildProductEmbeddingBasis({
      wasteName: product.wasteName,
      description: product.description,
      tags: product.tags,
      species: product.species,
      use_cases: product.use_cases,
    });

    if (!embeddingText) {
      return response.sendBadRequest(res, "Produk tidak memiliki konten teks untuk di-embed");
    }

    const vector = await embedDoc(embeddingText);
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSION) {
      return response.sendInternalError(
        res,
        `Vektor yang dihasilkan tidak valid (dimensi ${vector?.length}, dibutuhkan ${EMBEDDING_DIMENSION})`
      );
    }

    product.vector = vector;
    product.updatedAt = new Date();
    await product.save();

    return response.sendSuccess(res, {
      data: {
        _id: product._id,
        wasteName: product.wasteName,
        slug: product.slug,
        hasVector: true,
        vectorDimensions: vector.length,
      },
      message: `AI Vector Embedding berhasil diperbarui (${vector.length} dimensi).`,
    });
  } catch (err: any) {
    console.error("embedProductByAdmin error:", err);
    return response.sendInternalError(
      res,
      err.message || "Gagal meng-generate embedding untuk produk ini."
    );
  }
};

// POST /admin/products/embed-missing - On-demand batch generate embedding for all products missing valid vector
export const embedMissingProductsByAdmin = async (req: Request, res: Response) => {
  try {
    const query: any = {
      isDeleted: { $ne: true },
      $or: [
        { vector: { $exists: false } },
        { vector: { $size: 0 } },
        { $expr: { $ne: [{ $size: { $ifNull: ["$vector", []] } }, EMBEDDING_DIMENSION] } },
      ],
    };

    const productsToEmbed = await FarmWaste.find(query);
    if (productsToEmbed.length === 0) {
      return response.sendSuccess(res, {
        data: {
          total: 0,
          succeeded: 0,
          failed: 0,
        },
        message: "Semua produk aktif sudah memiliki AI Vector Embedding yang valid!",
      });
    }

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ id: string; name: string; error: string }> = [];

    for (const prod of productsToEmbed) {
      const embeddingText = buildProductEmbeddingBasis({
        wasteName: prod.wasteName,
        description: prod.description,
        tags: prod.tags,
        species: prod.species,
        use_cases: prod.use_cases,
      });

      if (!embeddingText) {
        failed++;
        errors.push({ id: String(prod._id), name: prod.wasteName, error: "Konten teks kosong" });
        continue;
      }

      try {
        const vector = await embedDoc(embeddingText);
        if (Array.isArray(vector) && vector.length === EMBEDDING_DIMENSION) {
          prod.vector = vector;
          prod.updatedAt = new Date();
          await prod.save();
          succeeded++;
        } else {
          failed++;
          errors.push({
            id: String(prod._id),
            name: prod.wasteName,
            error: `Dimensi tidak cocok (${vector?.length})`,
          });
        }
      } catch (embErr: any) {
        failed++;
        errors.push({
          id: String(prod._id),
          name: prod.wasteName,
          error: embErr?.message || "Error saat embed",
        });
      }

      // Delay kecil untuk mencegah rate-limiting
      await new Promise((r) => setTimeout(r, 200));
    }

    return response.sendSuccess(res, {
      data: {
        total: productsToEmbed.length,
        succeeded,
        failed,
        errors: errors.slice(0, 5),
      },
      message: `Proses sync embedding selesai: ${succeeded} berhasil, ${failed} gagal dari total ${productsToEmbed.length} produk.`,
    });
  } catch (err: any) {
    console.error("embedMissingProductsByAdmin error:", err);
    return response.sendInternalError(
      res,
      err.message || "Gagal memproses batch embedding produk."
    );
  }
};

export default {
  getDashboardStats,
  getAllTransactions,
  getTransactionDetail,
  updateTransactionStatusByAdmin,
  getAllUsers,
  getUserDetail,
  resetUserPasswordByAdmin,
  getAllStores,
  getStoreDetail,
  getAllProducts,
  getProductDetail,
  toggleProductSoftDelete,
  toggleProductActiveByAdmin,
  createProductByAdmin,
  updateProductByAdmin,
  embedProductByAdmin,
  embedMissingProductsByAdmin,
};


