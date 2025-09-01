import mongoose, { Document, Schema, Types } from "mongoose";

export interface IFarmWaste extends Document {
  storeId: Types.ObjectId;
  wasteName: string;
  description?: string;
  slug: string;
  imageUrls: string[];
  averageRating?: number;
  categories?: Types.ObjectId[];
  stock?: number;
  tags?: string[];
  species?: string[];
  use_cases?: string[];
  vector?: number[];
  createdAt: Date;
  updatedAt: Date;
}

const FarmWasteSchema: Schema = new Schema<IFarmWaste>({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
  wasteName: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  imageUrls: { type: [String], default: [] },
  averageRating: { type: Number },
  categories: [{ type: Schema.Types.ObjectId, default: [], ref: "Category" }],
  tags: { type: [String], index: true, default: [] },
  species: { type: [String], index: true, default: [] },
  use_cases: { type: [String], index: true, default: [] },
  vector: { type: [Number], index: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const FarmWaste = mongoose.model<IFarmWaste>(
  "FarmWaste",
  FarmWasteSchema
);
