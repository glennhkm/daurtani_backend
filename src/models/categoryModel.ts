import mongoose, { Document, Schema } from "mongoose";

export interface ICategory extends Document {
  name: string;
  categoryGroupId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema: Schema = new Schema<ICategory>({
  name: { type: String, required: true },
  categoryGroupId: { type: Schema.Types.ObjectId, ref: "CategoryGroup", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Category = mongoose.model<ICategory>("Category", CategorySchema);