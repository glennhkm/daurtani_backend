import mongoose, { Document, Schema, Types } from "mongoose";

// Interface for Address
export interface IAddress extends Document {
  province: string;
  city: string;
  district: string;
  postalCode: number;
  detail: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema: Schema = new Schema<IAddress>({
  province: { type: String, required: true },
  city: { type: String, required: true },
  district: { type: String, required: true },
  postalCode: { type: Number, required: true },
  detail: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Address = mongoose.model<IAddress>("Address", AddressSchema);