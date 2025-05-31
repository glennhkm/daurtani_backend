import mongoose, { Document, Schema, Types } from "mongoose";

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  cartId: Types.ObjectId;
  totalPriceTransaction: number;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema: Schema = new Schema<ITransaction>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  cartId: { type: Schema.Types.ObjectId, ref: "Cart", required: true },
  totalPriceTransaction: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);