import mongoose, { Document, Schema, Types } from "mongoose";

export interface IFarmWaste extends Document {
  storeId: Types.ObjectId;
  wasteName: string;
  description?: string;
  imageUrls: string[];
  averageRating?: number;
  createdAt: Date;
  updatedAt: Date;
}

const FarmWasteSchema: Schema = new Schema<IFarmWaste>({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
  wasteName: { type: String, required: true },
  description: { type: String },
  imageUrls: { type: [String], default: [] },
  averageRating: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const FarmWaste = mongoose.model<IFarmWaste>("FarmWaste", FarmWasteSchema);