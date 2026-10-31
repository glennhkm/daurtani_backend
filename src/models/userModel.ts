import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  fullName: string;
  email: string;
  role?: "user" | "admin";
  phoneNumber?: string;
  isEmailVerified?: boolean;
  activationTokenHash?: string | null;
  activationTokenExpiresAt?: Date | null;
  activationLastSentAt?: Date | null;
  resetPasswordTokenHash?: string | null;
  resetPasswordExpiresAt?: Date | null;
  resetPasswordLastSentAt?: Date | null;
  authSyncCipher?: string | null;
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
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  isEmailVerified: { type: Boolean, required: false },
  activationTokenHash: { type: String, required: false, default: null },
  activationTokenExpiresAt: { type: Date, required: false, default: null },
  activationLastSentAt: { type: Date, required: false, default: null },
  resetPasswordTokenHash: { type: String, required: false, default: null },
  resetPasswordExpiresAt: { type: Date, required: false, default: null },
  resetPasswordLastSentAt: { type: Date, required: false, default: null },
  authSyncCipher: { type: String, required: false, default: null },
  accessToken: { type: String, required: false },
  refreshToken: { type: String, required: false },
  phoneNumber: { type: String, required: false },
  provinsi: {
    type: {
      id: { type: Number, required: true },
      name: { type: String, required: true },
    },
    required: false,
  },
  kota: {
    type: {
      id: { type: Number, required: true },
      name: { type: String, required: true },
    },
    required: false,
  },
  kecamatan: {
    type: {
      id: { type: Number, required: true },
      name: { type: String, required: true },
    },
    required: false,
  },
  detailAlamat: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const User = mongoose.model<IUser>("User", UserSchema);
