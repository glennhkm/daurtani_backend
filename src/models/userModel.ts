import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUser extends Document {
  fullName: string;
  email: string;
  phoneNumber?: string;
  accessToken?: string;
  refreshToken?: string;
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
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema<IUser>({
  fullName: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  accessToken: { type: String, required: false },
  refreshToken: { type: String, required: false },
  phoneNumber: { type: String, required: false },
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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const User = mongoose.model<IUser>("User", UserSchema);
