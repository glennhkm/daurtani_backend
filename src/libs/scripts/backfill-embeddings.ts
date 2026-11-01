import "dotenv/config";
import mongoose from "mongoose";
import { FarmWaste } from "../../models/farmWasteModel";
import { embedDoc, EMBEDDING_DIMENSION, EMBEDDING_MODEL } from "../services/productVectorSearch/embedding";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "daurtani_ppl";

async function main() {
  const FORCE_ALL = process.argv.includes("--all");
  const DRY_RUN = process.argv.includes("--dry-run");

  console.log("=== Backfill Farmwaste Vector Embeddings ===");
  console.log(`Model: ${EMBEDDING_MODEL}`);
  console.log(`Expected Dimension: ${EMBEDDING_DIMENSION}`);
  console.log(`Target Database: ${DB_NAME}`);
  console.log(`Mode: ${FORCE_ALL ? "Re-embed ALL documents" : "Only documents missing 1536-dim vector"}`);
  if (DRY_RUN) console.log("DRY RUN: No changes will be written to MongoDB");

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log("Connected to MongoDB successfully.\n");

  const collection = mongoose.connection.collection("farmwastes");

  // Periksa search index
  try {
    const searchIndexes = await collection.listSearchIndexes().toArray();
    console.log(`Search indexes found on 'farmwastes': ${searchIndexes.length}`);
    searchIndexes.forEach((idx: any) => {
      const vectorField = idx.latestDefinition?.fields?.find(
        (f: any) => f.type === "vector"
      );
      console.log(
        `- Index: "${idx.name}" | Status: ${idx.status} | Queryable: ${idx.queryable} | Dimensions: ${vectorField?.numDimensions ?? "N/A"}`
      );
    });
    console.log("");
  } catch (err: any) {
    console.warn("Could not list search indexes:", err?.message || err);
  }

  // Filter dokumen yang perlu di-embed
  const query: any = { isDeleted: { $ne: true } };
  if (!FORCE_ALL) {
    query.$or = [
      { vector: { $exists: false } },
      { vector: { $size: 0 } },
      { $expr: { $ne: [{ $size: { $ifNull: ["$vector", []] } }, EMBEDDING_DIMENSION] } },
    ];
  }

  const docsToUpdate = await FarmWaste.find(query);
  console.log(`Found ${docsToUpdate.length} documents requiring embedding update.\n`);

  if (docsToUpdate.length === 0) {
    console.log("All active documents already have valid 1536-dim embeddings! Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < docsToUpdate.length; i++) {
    const doc = docsToUpdate[i];
    const textToEmbed = [
      doc.wasteName,
      doc.description || "",
      ...(doc.tags || []),
      ...(doc.species || []),
      ...(doc.use_cases || []),
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    console.log(`[${i + 1}/${docsToUpdate.length}] Processing: "${doc.wasteName}" (slug: ${doc.slug})`);

    if (!textToEmbed) {
      console.warn(`  Skipping: Document has no text content to embed.`);
      continue;
    }

    try {
      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would generate embedding for ${textToEmbed.length} chars.`);
        successCount++;
        continue;
      }

      const vector = await embedDoc(textToEmbed);
      if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSION) {
        throw new Error(`Invalid vector returned. Length=${vector?.length}, expected=${EMBEDDING_DIMENSION}`);
      }

      await FarmWaste.updateOne(
        { _id: doc._id },
        {
          $set: {
            vector,
            updatedAt: new Date(),
          },
        }
      );

      console.log(`  Success! Vector updated (${vector.length} dimensions).`);
      successCount++;
    } catch (err: any) {
      console.error(`  Failed to embed "${doc.wasteName}":`, err?.message || err);
      failCount++;
    }

    // Rate-limiting pause antar request (300ms)
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\n=== Backfill Summary ===");
  console.log(`Total: ${docsToUpdate.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

main().catch((err) => {
  console.error("Backfill script encountered fatal error:", err);
  process.exit(1);
});
