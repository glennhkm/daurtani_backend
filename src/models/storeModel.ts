import mongoose, { Document, Schema, Types } from "mongoose";

export interface IStore extends Document {
  storeAddressId: Types.ObjectId;
  ownerId: Types.ObjectId;
  storeName: string;
  description?: string;
  averageRating?: number;
  createdAt: Date;
  updatedAt: Date;
}

const StoreSchema: Schema = new Schema<IStore>({
  storeAddressId: { type: Schema.Types.ObjectId, ref: "Address", required: false },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  storeName: { type: String, required: true },
  description: { type: String },
  averageRating: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});


export const Store = mongoose.model<IStore>("Store", StoreSchema);