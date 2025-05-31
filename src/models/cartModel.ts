import mongoose, { Document, Schema, Types } from "mongoose";

export interface ICart extends Document {
  userId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CartSchema: Schema = new Schema<ICart>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Cart = mongoose.model<ICart>("Cart", CartSchema);