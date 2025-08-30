import mongoose, { Document, Schema, Types } from "mongoose";

export interface IFarmWaste extends Document {
  storeId: Types.ObjectId;
  wasteName: string;
  description?: string;
  slug: string;
  imageUrls: string[];
  averageRating?: number;
  createdAt: Date;
  categories?: Types.ObjectId[];
  updatedAt: Date;
}

const FarmWasteSchema: Schema = new Schema<IFarmWaste>({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
  wasteName: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  imageUrls: { type: [String], default: [] },
  averageRating: { type: Number },
  createdAt: { type: Date, default: Date.now },
  categories: [{ type: Schema.Types.ObjectId, default: [], ref: "Category" }],
  updatedAt: { type: Date, default: Date.now },
});

export const FarmWaste = mongoose.model<IFarmWaste>(
  "FarmWaste",
  FarmWasteSchema
);
