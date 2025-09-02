import mongoose, { Document, Schema, Types } from "mongoose";

export interface ITransactionItem {
  productId: Types.ObjectId; // farmWasteId
  wasteName: string;
  productImage?: string; // primary image snapshot
  productImages?: string[]; // optional all images
  unit: string;
  unitPrice: number;
  quantity: number;
  total: number;
  storeId?: Types.ObjectId;
  storeName?: string;
}

export interface IShippingAddressSnapshot {
  province: string;
  regency: string;
  district: string;
  village?: string;
  fullAddress: string;
}

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  cartId?: Types.ObjectId; // cart at time of checkout (optional if cart cleared)
  orderId: string; // external order/invoice identifier (from DOKU)
  paymentRequestId?: string; // request id returned by gateway
  paymentUrl?: string; // for re-open if still pending
  items: ITransactionItem[];
  subtotal: number;
  shippingCost: number;
  shippingMethod?: string;
  totalAmount: number; // subtotal + shipping
  currency: string;
  status: "pending" | "paid" | "expired" | "cancelled" | "failed" | "refunded" | "completed";
  shippingAddress: IShippingAddressSnapshot;
  paymentExpiry?: Date; // when payment window closes
  paidAt?: Date;
  cancelledAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionItemSchema = new Schema<ITransactionItem>({
  productId: { type: Schema.Types.ObjectId, ref: "FarmWaste", required: true },
  wasteName: { type: String, required: true },
  productImage: { type: String },
  productImages: { type: [String], default: [] },
  unit: { type: String, required: true },
  unitPrice: { type: Number, required: true },
  quantity: { type: Number, required: true },
  total: { type: Number, required: true },
  storeId: { type: Schema.Types.ObjectId, ref: "Store" },
  storeName: { type: String },
}, { _id: false });

const ShippingAddressSnapshotSchema = new Schema<IShippingAddressSnapshot>({
  province: { type: String, required: true },
  regency: { type: String, required: true },
  district: { type: String, required: true },
  village: { type: String },
  fullAddress: { type: String, required: false },
}, { _id: false });

const TransactionSchema: Schema = new Schema<ITransaction>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  cartId: { type: Schema.Types.ObjectId, ref: "Cart" },
  orderId: { type: String, required: true, unique: true, index: true },
  paymentRequestId: { type: String },
  paymentUrl: { type: String },
  items: { type: [TransactionItemSchema], required: true },
  subtotal: { type: Number, required: true },
  shippingCost: { type: Number, required: true, default: 0 },
  shippingMethod: { type: String },
  totalAmount: { type: Number, required: true },
  currency: { type: String, required: true, default: "IDR" },
  status: { type: String, enum: ["pending","paid","expired","cancelled","failed","refunded","completed"], default: "pending", index: true },
  shippingAddress: { type: ShippingAddressSnapshotSchema, required: true },
  paymentExpiry: { type: Date },
  paidAt: { type: Date },
  cancelledAt: { type: Date },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index nested item storeId for store-owner transaction lookups
TransactionSchema.index({ 'items.storeId': 1, createdAt: -1 });

TransactionSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

export const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);