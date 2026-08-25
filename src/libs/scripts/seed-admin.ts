import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../utils/db";
import { User } from "../../models/userModel";
import supabase from "../supabase/client";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@daurtani.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminDaurTani2026!";
const ADMIN_NAME = "Super Administrator DaurTani";
const ADMIN_PHONE = "081234567890";

async function seedAdmin() {
  console.log("=========================================");
  console.log("🌱 SEEDING ADMIN DAURTANI...");
  console.log("=========================================");

  await connectDB();

  // 1. Check or create in Supabase Auth
  console.log(`Checking Supabase Auth for: ${ADMIN_EMAIL}`);
  let session = null;

  // Try login first
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  if (!loginError && loginData.session) {
    console.log("✅ Supabase Auth user already exists and authenticated");
    session = loginData.session;
  } else {
    console.log("Creating new user in Supabase Auth...");
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      options: {
        data: {
          full_name: ADMIN_NAME,
          phone_number: ADMIN_PHONE,
        },
      },
    });

    if (signUpError) {
      console.warn("⚠️ Supabase SignUp note:", signUpError.message);
    } else {
      console.log("✅ Supabase Auth user created successfully");
      session = signUpData.session;
    }
  }

  // 2. Upsert in MongoDB with role 'admin'
  console.log("Upserting admin user in MongoDB...");
  const mongoAdmin = await User.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      $set: {
        fullName: ADMIN_NAME,
        role: "admin",
        phoneNumber: ADMIN_PHONE,
        accessToken: session?.access_token || undefined,
        refreshToken: session?.refresh_token || undefined,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  console.log("✅ Admin MongoDB record ready with ID:", mongoAdmin._id);
  console.log("=========================================");
  console.log("🎉 ADMIN SEED COMPLETED!");
  console.log("Credentials for Web Admin:");
  console.log(`  📧 Email   : ${ADMIN_EMAIL}`);
  console.log(`  🔑 Password: ${ADMIN_PASSWORD}`);
  console.log(`  🛡️ Role    : ${mongoAdmin.role}`);
  console.log("=========================================");

  await mongoose.disconnect();
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
