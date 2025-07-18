import mongoose, { Document, Schema, Types } from "mongoose";

export interface IStore extends Document {
  ownerId: Types.ObjectId;
  storeName: string;
  provinsi?: {
    id: number;
    name: string;
  };
  kota?: {
    id: number;
    name: string;
  };
  kecamatan?: {
    id: number;
    name: string;
  };
  detailAlamat?: string;
  description?: string;
  averageRating?: number;
  whatsAppNumber?: string;
  instagram?: string;
  facebook?: string;
  officialWebsite?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StoreSchema: Schema = new Schema<IStore>({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  storeName: { type: String, required: true },
  provinsi: {
    type: {
      id: { type: Number, required: true },
      name: { type: String, required: true }
    },
    required: false
  },
  kota: {
    type: {
      id: { type: Number, required: true },
      name: { type: String, required: true }
    },
    required: false
  },
  kecamatan: {
    type: {
      id: { type: Number, required: true },
      name: { type: String, required: true }
    },
    required: false
  },
  detailAlamat: { type: String, required: false },
  description: { type: String },
  averageRating: { type: Number },
  whatsAppNumber: { type: String },
  instagram: { type: String },
  facebook: { type: String },
  officialWebsite: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});


export const Store = mongoose.model<IStore>("Store", StoreSchema);