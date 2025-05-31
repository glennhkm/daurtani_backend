import mongoose, { Document, Schema, Types } from "mongoose";

export interface ICartItem extends Document {
  farmWasteId: Types.ObjectId;
  unitsPriceId: Types.ObjectId;
  cartId: Types.ObjectId;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  totalPriceItem: number;
  createdAt: Date;
  updatedAt: Date;
}

const CartItemSchema: Schema = new Schema<ICartItem>({
  farmWasteId: { type: Schema.Types.ObjectId, ref: "FarmWaste", required: true },
  unitsPriceId: { type: Schema.Types.ObjectId, ref: "UnitsPrice", required: true },
  cartId: { type: Schema.Types.ObjectId, ref: "Cart", required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  pricePerUnit: { type: Number, required: true },
  totalPriceItem: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const CartItem = mongoose.model<ICartItem>("CartItem", CartItemSchema);