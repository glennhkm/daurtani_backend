import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUnitPrice extends Document {
  farmWasteId: Types.ObjectId;
  unit: string;
  pricePerUnit: number;
  isBaseUnit: boolean;
  stock?: number;
  equalWith?: number;
  createdAt: Date;
  updatedAt: Date;
}

const UnitPriceSchema: Schema = new Schema<IUnitPrice>({
  farmWasteId: { type: Schema.Types.ObjectId, ref: "FarmWaste", required: true },
  unit: { type: String, required: true },
  pricePerUnit: { type: Number, required: true },
  isBaseUnit: { type: Boolean, default: false },
  stock: { type: Number },
  equalWith: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const UnitPrice = mongoose.model<IUnitPrice>("UnitPrice", UnitPriceSchema);