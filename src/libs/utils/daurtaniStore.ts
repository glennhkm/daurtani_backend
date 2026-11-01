import mongoose from "mongoose";
import { Store, IStore } from "../../models/storeModel";
import { User } from "../../models/userModel";

/**
 * Mengambil atau membuat Official Store "DaurTani" jika belum tersedia di database.
 * Ini memastikan integritas relasional MongoDB tetap terjaga (storeId selalu valid),
 * sekaligus memastikan data alamat asal pengiriman terisi untuk kalkulasi ongkir.
 */
export async function getOrCreateDaurTaniStore(): Promise<IStore> {
  // 1. Cek apakah toko resmi DaurTani sudah ada
  let store = await Store.findOne({
    $or: [{ storeName: "DaurTani" }, { storeName: "DaurTani Official Store" }],
  });

  if (store) {
    return store;
  }

  // 2. Jika belum ada, cari user admin sebagai ownerId
  let adminUser = await User.findOne({ role: "admin" });
  if (!adminUser) {
    // Fallback cari user sembarang jika belum ada role admin
    adminUser = await User.findOne();
  }

  if (!adminUser) {
    throw new Error(
      "Tidak dapat membuat Official Store DaurTani: Belum ada user terdaftar di database."
    );
  }

  // 3. Buat dokumen official store baru
  store = await Store.create({
    ownerId: adminUser._id,
    storeName: "DaurTani",
    description:
      "Official Store Platform DaurTani - Penyedia aneka limbah pertanian berkualitas terkurasi langsung dari mitra tani Indonesia.",
    averageRating: 5.0,
    provinsi: { id: 11, name: "ACEH" },
    kota: { id: 1101, name: "KAB. ACEH BESAR" },
    kecamatan: { id: 110101, name: "Ingin Jaya" },
    detailAlamat: "Pusat Distribusi & Layanan DaurTani, Aceh",
    whatsAppNumber: "081234567890",
    officialWebsite: "https://daurtani.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log("Official Store 'DaurTani' berhasil dibuat:", store._id);
  return store;
}

