import mongoose, { Document, Schema } from "mongoose";

export interface ICategoryGroup extends Document {
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const CategoryGroupSchema: Schema = new Schema<ICategoryGroup>({
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const CategoryGroup = mongoose.model<ICategoryGroup>("CategoryGroup", CategoryGroupSchema);