import { Request, Response } from "express";
import { Transaction } from "../models/transactionModel";
import { Cart } from "../models/cartModel";
import { CartItem } from "../models/cartItemModel";
import { FarmWaste } from "../models/farmWasteModel";
import response from "../libs/utils/responses";
import { AuthRequest } from "./cartController";
import mongoose from "mongoose";
import { UnitPrice } from "../models/unitPriceModel";

// Create transaction when initiating payment (before redirect to DOKU)
export const createTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return response.sendUnauthorized(res, "User not authenticated");

    const { orderId, requestId, amount, items, shippingMethod, shippingCost, shippingAddress, paymentUrl, paymentExpiry } = req.body;

    if (!orderId || !amount || !Array.isArray(items) || items.length === 0) {
      return response.sendBadRequest(res, "Missing required fields");
    }

    // optional: link to cart snapshot
    const cart = await Cart.findOne({ userId });
    let cartItems: any[] = [];
    if (cart) {
      cartItems = await CartItem.find({ cartId: cart._id });
    }

    const subtotal = items.reduce((t: number, it: any) => t + (it.total || 0), 0);

    // Map items to schema shape
    // Fetch farm waste docs for image snapshot (optimize with single query)
    const fwIds = items.map((it: any) => it.productId).filter(Boolean);
  const farmWastes = await FarmWaste.find({ _id: { $in: fwIds } }, { imageUrls: 1 });
  const fwMap = new Map<string, any>(farmWastes.map((fw: any) => [(fw._id as mongoose.Types.ObjectId).toString(), fw]));

    const mappedItems = items.map((it: any) => {
      const fw = fwMap.get(it.productId);
      const images: string[] = fw?.imageUrls || [];
      return {
        productId: new mongoose.Types.ObjectId(it.productId),
        wasteName: it.name || it.wasteName,
        productImage: images[0],
        productImages: images,
        unit: it.unit,
        unitPrice: it.price,
        quantity: it.quantity,
        total: it.total,
        storeId: it.storeId ? new mongoose.Types.ObjectId(it.storeId) : undefined,
        storeName: it.storeName,
      };
    });

    const exists = await Transaction.findOne({ orderId });
    if (exists) {
      return response.sendConflict(res, "Order already exists");
    }

    const tx = await Transaction.create({
      userId,
      cartId: cart?._id,
      orderId,
      paymentRequestId: requestId,
      paymentUrl,
      items: mappedItems,
      subtotal,
      shippingCost: shippingCost || 0,
      shippingMethod,
      totalAmount: amount,
      currency: "IDR",
      status: "pending",
      shippingAddress: shippingAddress,
      paymentExpiry: paymentExpiry ? new Date(paymentExpiry) : undefined,
      metadata: { cartItemsCount: cartItems.length },
    });

    return response.sendCreated(res, { message: "Transaction created", data: tx });
  } catch (err: any) {
    console.error("createTransaction error", err);
    return response.sendInternalError(res, err.message);
  }
};

export const listUserTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return response.sendUnauthorized(res, "Unauthorized");
    const { status } = req.query;
    const filter: any = { userId };
    if (status && typeof status === 'string') filter.status = status;
    const txs = await Transaction.find(filter).sort({ createdAt: -1 });
    return response.sendSuccess(res, { data: txs });
  } catch (err: any) {
    console.error("listUserTransactions error", err);
    return response.sendInternalError(res, err.message);
  }
};

export const getTransactionByOrderId = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return response.sendUnauthorized(res, "Unauthorized");
    const { orderId } = req.params;
    const tx = await Transaction.findOne({ orderId, userId });
    if (!tx) return response.sendNotFound(res, "Transaction not found");
    return response.sendSuccess(res, { data: tx });
  } catch (err: any) {
    console.error("getTransactionByOrderId error", err);
    return response.sendInternalError(res, err.message);
  }
};

// Update status via webhook or manual check (simplified manual endpoint for now)
export const updateTransactionStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, paidAt, paymentUrl } = req.body;
    const tx = await Transaction.findOneAndUpdate(
      { orderId },
      { status, paidAt: paidAt ? new Date(paidAt) : undefined, paymentUrl, updatedAt: new Date() },
      { new: true }
    );
    if (!tx) return response.sendNotFound(res, "Transaction not found");
    return response.sendSuccess(res, { message: "Status updated", data: tx });
  } catch (err: any) {
    console.error("updateTransactionStatus error", err);
    return response.sendInternalError(res, err.message);
  }
};

// Preview (validate) items before creating payment / transaction
export const previewTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return response.sendUnauthorized(res, "Unauthorized");
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return response.sendBadRequest(res, "Items required");
    }

    // Fetch all needed products & unit prices in batch
    const productIds = items.map((it: any) => it.productId).filter(Boolean);
    const fwDocs = await FarmWaste.find({ _id: { $in: productIds } });
    const fwMap = new Map(fwDocs.map(fw => [(fw._id as mongoose.Types.ObjectId).toString(), fw]));

    // Collect unitPriceIds if provided
    const unitPriceIds = items.map((it: any) => it.unitPriceId).filter(Boolean);
    const unitPriceDocs = await UnitPrice.find({ _id: { $in: unitPriceIds } });
    const upMap = new Map(unitPriceDocs.map(up => [(up._id as mongoose.Types.ObjectId).toString(), up]));

    const normalized: any[] = [];
    let subtotal = 0;
    let totalWeight = 0;

    for (const raw of items) {
      const { productId, unitPriceId, quantity } = raw;
      if (!productId || !unitPriceId || !quantity || quantity <= 0) {
        return response.sendBadRequest(res, "Invalid item structure");
      }
      const fw = fwMap.get(String(productId));
      if (!fw) {
        return response.sendBadRequest(res, `Product not found: ${productId}`);
      }
      const up = upMap.get(String(unitPriceId));
      if (!up || String(up.farmWasteId) !== String(productId)) {
        return response.sendBadRequest(res, "Unit price not found / mismatch");
      }
      if (typeof up.stock === "number" && quantity > up.stock) {
        return response.sendBadRequest(res, `Stock insufficient for ${fw.wasteName}`);
      }

      const lineTotal = up.pricePerUnit * quantity;
      subtotal += lineTotal;
      totalWeight += quantity * 1000; // still placeholder weight logic

      normalized.push({
        productId: fw._id,
        unitPriceId: up._id,
        wasteName: fw.wasteName,
        quantity,
        unit: up.unit,
        pricePerUnit: up.pricePerUnit,
        lineTotal,
        storeId: fw.storeId,
        images: fw.imageUrls,
      });
    }

    return response.sendSuccess(res, {
      data: {
        items: normalized,
        subtotal,
        totalWeight,
        currency: "IDR",
      },
      message: "Preview successful",
    });
  } catch (err: any) {
    console.error("previewTransaction error", err);
    return response.sendInternalError(res, err.message);
  }
};

export default {
  createTransaction,
  listUserTransactions,
  getTransactionByOrderId,
  updateTransactionStatus,
  previewTransaction, // added
};
