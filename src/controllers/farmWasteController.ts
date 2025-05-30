import { Context } from "hono";
import { getCollection, FarmWasteModel, Products } from "../models/scheme.js";
import { ObjectId } from "mongodb";
import supabase from "../libs/supabase/client.js";
import "dotenv/config";
import responses from "../libs/helpers/responses.js";

const createWasteListing = async (c: Context) => {
  const db = c.get("db");
  const data: FarmWasteModel = await c.req.json();
  const WasteListing = getCollection<FarmWasteModel>(db, "wasteListings");
  const newWasteListing: FarmWasteModel = {
    // wasteName: "Organic Waste",
    // storeId: new ObjectId("storeId"),
    // description,
    // averageRating: 0,
    // createdAt: new Date(),
    // updatedAt: new Date(),
    ...data,
  };
  const result = await WasteListing.insertOne(newWasteListing);
  return c.json(
    { wasteListing: { ...newWasteListing, _id: result.insertedId } },
    201
  );
};

const getAllWasteListings = async (c: Context) => {
  // const db = c.get("db");
  // const wasteListings = getCollection<FarmWasteModel>(db, "wasteListings");
  // const result = await wasteListings.find({}).toArray();
  // return c.json({ wasteListings: result }, 200);
  // console.log(process.env.SUPABASE_PROJECT_URL, process.env.SUPABASE_ANON_KEY);
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("nama_produk", "Testing");

  if (error) {
    console.error("Error fetching waste listings:", error);
    return responses.sendInternalError(c, "Failed to fetch waste listings");
  }
  // const wasteListings: Products[] = data as Products[];
  return responses.sendSuccess(c, { data });
};

export default {
  getAllWasteListings,
  createWasteListing,
};
