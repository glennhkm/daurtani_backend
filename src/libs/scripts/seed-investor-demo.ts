import mongoose from "mongoose";
import { createClient } from "@supabase/supabase-js";
import { User } from "../../models/userModel";
import { Store } from "../../models/storeModel";
import { FarmWaste } from "../../models/farmWasteModel";
import { UnitPrice } from "../../models/unitPriceModel";
import { Transaction } from "../../models/transactionModel";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dneeolvtrwklfmcseavo.supabase.co";
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZWVvbHZ0cndrbGZtY3NlYXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0NDUyNTEsImV4cCI6MjA2NDAyMTI1MX0.i0ZI56BDw3Fn7V3iJBsdrKcdQZTlkeVfBLWva0Cc3ow";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://glennhkm:26July04@hmif-web-db-dev.us3f3k8.mongodb.net/?retryWrites=true&w=majority&appName=hmif-web-db-dev";

const BATOK_IMAGE_URL =
  "https://dneeolvtrwklfmcseavo.supabase.co/storage/v1/object/public/daurtani/product-images/4e3e8a89-4a80-4308-97a9-57ffe5f88142/u4sebnovii_1756811920875.jpg";

async function ensureSupabaseUser(email: string, password: string, fullName: string, phoneNumber: string) {
  try {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone_number: phoneNumber,
        },
      },
    });

    if (signUpError && !signUpError.message.toLowerCase().includes("already registered")) {
      console.log(`Supabase notice for ${email}:`, signUpError.message);
    }
  } catch (err: any) {
    console.log(`Supabase auth exception for ${email}:`, err.message);
  }
}

async function runSeed() {
  console.log("🚀 Starting Natural 3-Month Distributed Seeder...");
  await mongoose.connect(MONGODB_URI, {
    dbName: process.env.DB_NAME || "daurtani_ppl",
  });
  console.log("✅ Connected to MongoDB (daurtani_ppl)");

  // 1. Setup 3 Suppliers (Distributed over 3 months)
  const suppliersConfig = [
    {
      key: "supplier_syahrul",
      email: "syahrul.munandar@gmail.com",
      password: "SupplierDaurTani2026!",
      fullName: "Teuku Syahrul Munandar",
      phoneNumber: "081269384721",
      storeName: "UD Batok Meutuah Aceh",
      provinsi: { id: 11, name: "ACEH" },
      kota: { id: 1106, name: "KABUPATEN ACEH BESAR" },
      kecamatan: { id: 1106040, name: "INGIN JAYA" },
      detailAlamat: "Jl. Banda Aceh - Medan Km 8.5, Lambaro, Ingin Jaya, Aceh Besar",
      productName: "Batok Kelapa Pilihan Kering Super (Tempurung Aceh)",
      slug: "batok-kelapa-pilihan-kering-super-aceh",
      pricePerKg: 2000,
      bankName: "Bank Syariah Indonesia (BSI)",
      bankAccountNumber: "7198234091",
      userCreatedAt: new Date("2026-05-28T08:15:00.000Z"),
      storeCreatedAt: new Date("2026-05-28T09:30:00.000Z"),
      productCreatedAt: new Date("2026-05-29T10:00:00.000Z"),
    },
    {
      key: "supplier_mahfud",
      email: "cut.mahfud@gmail.com",
      password: "SupplierDaurTani2026!",
      fullName: "Cut Mahfud Iskandar",
      phoneNumber: "085270198234",
      storeName: "Sentra Batok Seunagan Meulaboh",
      provinsi: { id: 11, name: "ACEH" },
      kota: { id: 1105, name: "KABUPATEN ACEH BARAT" },
      kecamatan: { id: 1105010, name: "JOHAN PAHLAWAN" },
      detailAlamat: "Jl. Manek Roo No. 45, Ujong Baroh, Johan Pahlawan, Meulaboh, Aceh Barat",
      productName: "Batok Kelapa Kualitas Ekspor untuk Briket Shisha",
      slug: "batok-kelapa-kualitas-ekspor-meulaboh",
      pricePerKg: 2100,
      bankName: "Bank Aceh Syariah",
      bankAccountNumber: "01002400089123",
      userCreatedAt: new Date("2026-06-04T09:30:00.000Z"),
      storeCreatedAt: new Date("2026-06-04T10:45:00.000Z"),
      productCreatedAt: new Date("2026-06-05T11:20:00.000Z"),
    },
    {
      key: "supplier_zulkifli",
      email: "zulkifli.harahap@gmail.com",
      password: "SupplierDaurTani2026!",
      fullName: "Zulkifli Harahap",
      phoneNumber: "082165438901",
      storeName: "UD Tempurung Beurata Samahani",
      provinsi: { id: 11, name: "ACEH" },
      kota: { id: 1106, name: "KABUPATEN ACEH BESAR" },
      kecamatan: { id: 1106090, name: "KUTA MALAKA" },
      detailAlamat: "Jl. Banda Aceh - Medan Km 19, Samahani, Kuta Malaka, Aceh Besar",
      productName: "Tempurung Kelapa Tua Kering Grade A Siap Giling",
      slug: "tempurung-kelapa-tua-kering-samahani",
      pricePerKg: 2200,
      bankName: "Bank Syariah Indonesia (BSI)",
      bankAccountNumber: "7109823441",
      userCreatedAt: new Date("2026-06-25T07:45:00.000Z"),
      storeCreatedAt: new Date("2026-06-25T08:30:00.000Z"),
      productCreatedAt: new Date("2026-06-26T14:10:00.000Z"),
    },
  ];

  const supplierMap: Record<string, { user: any; store: any; product: any; unitPrice: any }> = {};

  for (const sup of suppliersConfig) {
    await ensureSupabaseUser(sup.email, sup.password, sup.fullName, sup.phoneNumber);

    let user = await User.findOne({ email: sup.email });
    if (!user) {
      user = await User.create({
        email: sup.email,
        fullName: sup.fullName,
        phoneNumber: sup.phoneNumber,
        role: "user",
        provinsi: sup.provinsi,
        kota: sup.kota,
        kecamatan: sup.kecamatan,
        detailAlamat: sup.detailAlamat,
        createdAt: sup.userCreatedAt,
        updatedAt: sup.userCreatedAt,
      });
    } else {
      user.fullName = sup.fullName;
      user.phoneNumber = sup.phoneNumber;
      user.provinsi = sup.provinsi;
      user.kota = sup.kota;
      user.kecamatan = sup.kecamatan;
      user.detailAlamat = sup.detailAlamat;
      user.createdAt = sup.userCreatedAt;
      user.updatedAt = sup.userCreatedAt;
      await user.save();
    }

    let store = await Store.findOne({ ownerId: user._id });
    if (!store) {
      store = await Store.create({
        ownerId: user._id,
        storeName: sup.storeName,
        provinsi: sup.provinsi,
        kota: sup.kota,
        kecamatan: sup.kecamatan,
        detailAlamat: sup.detailAlamat,
        description: `Pemasok limbah batok kelapa dan tempurung kelapa tua kering pilihan dari petani lokal Aceh Besar dan Aceh Barat. Siap menyuplai kebutuhan rutin tonase besar untuk arang briket dan karbon aktif.`,
        whatsAppNumber: sup.phoneNumber,
        bankName: sup.bankName,
        bankAccountNumber: sup.bankAccountNumber,
        bankAccountHolder: sup.fullName,
        averageRating: 5.0,
        createdAt: sup.storeCreatedAt,
        updatedAt: sup.storeCreatedAt,
      });
    } else {
      store.storeName = sup.storeName;
      store.provinsi = sup.provinsi;
      store.kota = sup.kota;
      store.kecamatan = sup.kecamatan;
      store.detailAlamat = sup.detailAlamat;
      store.bankName = sup.bankName;
      store.bankAccountNumber = sup.bankAccountNumber;
      store.createdAt = sup.storeCreatedAt;
      store.updatedAt = sup.storeCreatedAt;
      await store.save();
    }

    let product = await FarmWaste.findOne({ slug: sup.slug });
    if (!product) {
      product = await FarmWaste.create({
        storeId: store._id,
        wasteName: sup.productName,
        slug: sup.slug,
        description: `Limbah batok kelapa kering berkualitas tinggi dengan kadar air rendah (<12%), bersih dari serabut, sangat padat dan siap diproses untuk pembakaran briket shisha, briket barbecue, dan media arang karbon.`,
        imageUrls: [BATOK_IMAGE_URL],
        averageRating: 5.0,
        stock: 50000,
        tags: ["batok kelapa", "tempurung kelapa", "limbah kelapa aceh", "briket", "arang"],
        species: ["Kelapa Dalam Aceh", "Kelapa Hibrida"],
        use_cases: ["Bahan Energi Briket", "Karbon Aktif", "Briket Shisha"],
        isDeleted: false,
        createdAt: sup.productCreatedAt,
        updatedAt: sup.productCreatedAt,
      });
    } else {
      product.storeId = store._id as any;
      product.wasteName = sup.productName;
      product.isDeleted = false;
      product.createdAt = sup.productCreatedAt;
      product.updatedAt = sup.productCreatedAt;
      await product.save();
    }

    let unitPrice = await UnitPrice.findOne({ farmWasteId: product._id, unit: "Kg" });
    if (!unitPrice) {
      unitPrice = await UnitPrice.create({
        farmWasteId: product._id,
        unit: "Kg",
        pricePerUnit: sup.pricePerKg,
        isBaseUnit: true,
        stock: 50000,
        equalWith: 1,
        createdAt: sup.productCreatedAt,
        updatedAt: sup.productCreatedAt,
      });
    } else {
      unitPrice.pricePerUnit = sup.pricePerKg;
      unitPrice.createdAt = sup.productCreatedAt;
      unitPrice.updatedAt = sup.productCreatedAt;
      await unitPrice.save();
    }

    supplierMap[sup.key] = { user, store, product, unitPrice };
    console.log(`✅ Supplier siap: ${sup.fullName} (Dibuat: ${sup.userCreatedAt.toISOString().split("T")[0]}) -> Toko: ${sup.storeName}`);
  }

  // 2. Setup Buyers (Distributed in June & July 2026)
  // Buyer A: rizqanbaihakki@gmail.com
  let rizqanUser = await User.findOne({ email: "rizqanbaihakki@gmail.com" });
  if (rizqanUser) {
    rizqanUser.phoneNumber = "085277192840";
    rizqanUser.provinsi = { id: 11, name: "ACEH" };
    rizqanUser.kota = { id: 1171, name: "KOTA BANDA ACEH" };
    rizqanUser.kecamatan = { id: 1171020, name: "SYIAH KUALA" };
    rizqanUser.detailAlamat = "Jl. Teuku Nyak Arief No. 42, Kopelma Darussalam, Syiah Kuala, Kota Banda Aceh";
    rizqanUser.createdAt = new Date("2026-05-30T14:20:00.000Z");
    rizqanUser.updatedAt = new Date("2026-05-30T14:20:00.000Z");
    await rizqanUser.save();
  }
  const rizqanAddress = {
    province: "ACEH",
    regency: "KOTA BANDA ACEH",
    district: "SYIAH KUALA",
    village: "Kopelma Darussalam",
    fullAddress: "Jl. Teuku Nyak Arief No. 42, Kopelma Darussalam, Syiah Kuala, Kota Banda Aceh",
  };
  console.log(`✅ Buyer Utama: Rizqan Baihakki (Dibuat: 2026-05-30)`);

  // Buyer B: Muhammad Farhan Al-Fasi (farhan.alfasi@gmail.com)
  const farhanEmail = "farhan.alfasi@gmail.com";
  const farhanCreatedAt = new Date("2026-06-15T13:00:00.000Z");
  await ensureSupabaseUser(farhanEmail, "BuyerDaurTani2026!", "Muhammad Farhan Al-Fasi", "082361728394");
  let farhanUser = await User.findOne({ email: farhanEmail });
  if (!farhanUser) {
    farhanUser = await User.create({
      email: farhanEmail,
      fullName: "Muhammad Farhan Al-Fasi",
      phoneNumber: "082361728394",
      role: "user",
      provinsi: { id: 11, name: "ACEH" },
      kota: { id: 1171, name: "KOTA BANDA ACEH" },
      kecamatan: { id: 1171010, name: "BANDA RAYA" },
      detailAlamat: "Jl. Soekarno-Hatta No. 88, Mibo, Banda Raya, Kota Banda Aceh",
      createdAt: farhanCreatedAt,
      updatedAt: farhanCreatedAt,
    });
  } else {
    farhanUser.createdAt = farhanCreatedAt;
    farhanUser.updatedAt = farhanCreatedAt;
    await farhanUser.save();
  }
  const farhanAddress = {
    province: "ACEH",
    regency: "KOTA BANDA ACEH",
    district: "BANDA RAYA",
    village: "Mibo",
    fullAddress: "Jl. Soekarno-Hatta No. 88, Mibo, Banda Raya, Kota Banda Aceh",
  };
  console.log(`✅ Buyer B: Muhammad Farhan Al-Fasi (Dibuat: 2026-06-15)`);

  // Buyer C: Fachrurrazi Siregar (fachrur.siregar@gmail.com)
  const fachrurEmail = "fachrur.siregar@gmail.com";
  const fachrurCreatedAt = new Date("2026-07-10T16:20:00.000Z");
  await ensureSupabaseUser(fachrurEmail, "BuyerDaurTani2026!", "Fachrurrazi Siregar", "081396245781");
  let fachrurUser = await User.findOne({ email: fachrurEmail });
  if (!fachrurUser) {
    fachrurUser = await User.create({
      email: fachrurEmail,
      fullName: "Fachrurrazi Siregar",
      phoneNumber: "081396245781",
      role: "user",
      provinsi: { id: 11, name: "ACEH" },
      kota: { id: 1106, name: "KABUPATEN ACEH BESAR" },
      kecamatan: { id: 1106030, name: "DARUL IMARAH" },
      detailAlamat: "Jl. Fatahillah No. 24, Geundring, Darul Imarah, Aceh Besar",
      createdAt: fachrurCreatedAt,
      updatedAt: fachrurCreatedAt,
    });
  } else {
    fachrurUser.createdAt = fachrurCreatedAt;
    fachrurUser.updatedAt = fachrurCreatedAt;
    await fachrurUser.save();
  }
  const fachrurAddress = {
    province: "ACEH",
    regency: "KABUPATEN ACEH BESAR",
    district: "DARUL IMARAH",
    village: "Geundring",
    fullAddress: "Jl. Fatahillah No. 24, Geundring, Darul Imarah, Aceh Besar",
  };
  console.log(`✅ Buyer C: Fachrurrazi Siregar (Dibuat: 2026-07-10)`);

  // 3. Update 7 Realistic Paid Transactions (Exact dates spread over Jun - Aug 2026)
  const transactionsData = [
    {
      orderId: "COD-1780821600000-8f2a1b",
      date: new Date("2026-06-08T10:30:00.000Z"),
      paidDate: new Date("2026-06-08T14:20:00.000Z"),
      supplierKey: "supplier_syahrul",
      buyerUser: rizqanUser!,
      buyerAddress: rizqanAddress,
      qty: 150,
      pricePerKg: 2000,
      totalAmount: 300000,
    },
    {
      orderId: "COD-1781772000000-4c7e2d",
      date: new Date("2026-06-19T09:15:00.000Z"),
      paidDate: new Date("2026-06-19T13:45:00.000Z"),
      supplierKey: "supplier_mahfud",
      buyerUser: rizqanUser!,
      buyerAddress: rizqanAddress,
      qty: 200,
      pricePerKg: 2100,
      totalAmount: 420000,
    },
    {
      orderId: "COD-1782895200000-9a3b5f",
      date: new Date("2026-07-02T11:00:00.000Z"),
      paidDate: new Date("2026-07-02T15:30:00.000Z"),
      supplierKey: "supplier_syahrul",
      buyerUser: farhanUser!,
      buyerAddress: farhanAddress,
      qty: 250,
      pricePerKg: 2000,
      totalAmount: 500000,
    },
    {
      orderId: "COD-1783932300000-1e6d8c",
      date: new Date("2026-07-14T08:45:00.000Z"),
      paidDate: new Date("2026-07-14T12:10:00.000Z"),
      supplierKey: "supplier_zulkifli",
      buyerUser: rizqanUser!,
      buyerAddress: rizqanAddress,
      qty: 175,
      pricePerKg: 2100,
      totalAmount: 367500,
    },
    {
      orderId: "COD-1785142800000-5b8a2e",
      date: new Date("2026-07-28T14:20:00.000Z"),
      paidDate: new Date("2026-07-28T17:50:00.000Z"),
      supplierKey: "supplier_mahfud",
      buyerUser: fachrurUser!,
      buyerAddress: fachrurAddress,
      qty: 300,
      pricePerKg: 2200,
      totalAmount: 660000,
    },
    {
      orderId: "COD-1786356000000-3f7c9a",
      date: new Date("2026-08-11T10:00:00.000Z"),
      paidDate: new Date("2026-08-11T16:00:00.000Z"),
      supplierKey: "supplier_syahrul",
      buyerUser: farhanUser!,
      buyerAddress: farhanAddress,
      qty: 225,
      pricePerKg: 2100,
      totalAmount: 472500,
    },
    {
      orderId: "COD-1787394600000-7d2e4b",
      date: new Date("2026-08-23T13:10:00.000Z"),
      paidDate: new Date("2026-08-23T18:30:00.000Z"),
      supplierKey: "supplier_zulkifli",
      buyerUser: rizqanUser!,
      buyerAddress: rizqanAddress,
      qty: 350,
      pricePerKg: 2200,
      totalAmount: 770000,
    },
  ];

  console.log("\n📦 Menambahkan 7 transaksi real dengan tanggal realistis 3 bulan terakhir...");

  for (const t of transactionsData) {
    const sup = supplierMap[t.supplierKey];

    const txDoc = {
      userId: t.buyerUser._id,
      orderId: t.orderId,
      paymentRequestId: "COD-PAY-" + t.orderId.split("-")[1],
      paymentUrl: null,
      items: [
        {
          productId: sup.product._id,
          wasteName: sup.product.wasteName,
          productImage: BATOK_IMAGE_URL,
          productImages: [BATOK_IMAGE_URL],
          unit: "Kg",
          unitPrice: t.pricePerKg,
          quantity: t.qty,
          total: t.totalAmount,
          storeId: sup.store._id,
          storeName: sup.store.storeName,
        },
      ],
      subtotal: t.totalAmount,
      shippingCost: 0,
      shippingMethod: "COD (Bayar di Tempat)",
      totalAmount: t.totalAmount,
      currency: "IDR",
      status: "paid", // Lunas
      shippingAddress: t.buyerAddress,
      paidAt: t.paidDate,
      createdAt: t.date,
      updatedAt: t.paidDate,
      metadata: {
        commodity: "Limbah kelapa",
        paymentNote: "Pembayaran COD telah lunas diterima oleh pihak penjual di lokasi",
        realAcehDemo: true,
      },
    };

    await Transaction.findOneAndUpdate(
      { orderId: t.orderId },
      { $set: txDoc },
      { upsert: true, new: true }
    );

    const dStr = t.date.toISOString().split("T")[0];
    console.log(
      `  [${t.orderId}] ${dStr} | ${sup.store.storeName} -> ${t.buyerUser.fullName} (${t.buyerUser.email}) | ${t.qty} Kg @ Rp${t.pricePerKg.toLocaleString("id-ID")} = Rp${t.totalAmount.toLocaleString("id-ID")} [LUNAS / PAID]`
    );
  }

  // Also distribute the creation dates of the admin account to 3 months ago (e.g. 2026-05-20)
  await User.updateOne({ email: "admin@daurtani.com" }, { $set: { createdAt: new Date("2026-05-20T08:00:00.000Z"), updatedAt: new Date("2026-05-20T08:00:00.000Z") } });

  console.log("\n🎉 Seluruh data (User, Toko, Produk, Transaksi) berhasil disesuaikan dalam 3 bulan terakhir!");
  await mongoose.disconnect();
}

runSeed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
