import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICart extends Document {
  userId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CartSchema = new Schema<ICart>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

CartSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

export const Cart = mongoose.model<ICart>("Cart", CartSchema);