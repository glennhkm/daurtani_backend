import mongoose, { Document, Schema, Types } from "mongoose";

export interface IReview extends Document {
  userId: Types.ObjectId;
  farmWasteId: Types.ObjectId;
  transactionId: Types.ObjectId;
  rating: 1 | 2 | 3 | 4 | 5;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema: Schema = new Schema<IReview>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  farmWasteId: { type: Schema.Types.ObjectId, ref: "FarmWaste", required: true },
  transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", required: true },
  rating: { type: Number, enum: [1, 2, 3, 4, 5], required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Review = mongoose.model<IReview>("Review", ReviewSchema);