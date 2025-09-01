import "dotenv/config";
import mongoose, { Types } from "mongoose";
import { FarmWaste } from "../../models/farmWasteModel";
import { UnitPrice } from "../../models/unitPriceModel";
import { connectDB } from "../utils/db";
import { embedDoc } from "../services/productVectorSearch/embedding";

/** ================= Utils ================= **/
function toSlug(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function uniqueSlug(base: string, skipId?: Types.ObjectId): Promise<string> {
  let slug = toSlug(base);
  let suffix = 2;
  while (true) {
    const clash = await FarmWaste.findOne({ slug }).select("_id").lean();
    if (!clash || (skipId && String(clash._id) === String(skipId))) break;
    slug = `${toSlug(base)}-${suffix++}`;
  }
  return slug;
}

function normStringArray(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  }
  return String(input)
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

async function aggregateProductStock(farmWasteId: Types.ObjectId): Promise<number> {
  const stocks = await UnitPrice.aggregate([
    { $match: { farmWasteId } },
    { $group: { _id: "$farmWasteId", total: { $sum: { $ifNull: ["$stock", 0] } } } },
  ]);
  return stocks?.[0]?.total ?? 0;
}

function buildEmbeddingBasis(doc: {
  wasteName: string;
  description?: string | null;
  tags?: string[];
}) {
  return [doc.wasteName, doc.description || "", ...(doc.tags || [])]
    .join("\n")
    .trim();
}

/** ================= Main ================= **/
async function main() {
  const DRY_RUN = process.argv.includes("--dry");
  const ONLY_MISSING = process.argv.includes("--only-missing");
  const BATCH = Number(process.env.BATCH_SIZE || "100");

  // Validasi env minimal untuk embedding HF
  if (!process.env.HF_TOKEN) {
    console.warn("[WARN] HF_TOKEN tidak di-set. Embedding akan gagal. Set .env terlebih dulu.");
  }
  // Pastikan index Atlas vector = 1024 dim untuk multilingual-e5-large

  await connectDB();
  console.log("Connected to MongoDB");

  const query: any = {};
  if (ONLY_MISSING) {
    query.$or = [{ vector: { $exists: false } }, { vector: { $size: 0 } }];
  }

  const total = await FarmWaste.countDocuments(query);
  console.log(
    `Found ${total} farmwaste documents to process ${ONLY_MISSING ? "(only missing vectors)" : ""}`
  );

  const cursor = FarmWaste.find(query).cursor();
  let processed = 0;
  const batch: any[] = [];
  const failedIds: string[] = [];

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH) {
      await processBatch(batch, { DRY_RUN, failedIds });
      processed += batch.length;
      console.log(`Processed ${processed}/${total}`);
      batch.length = 0;
    }
  }

  if (batch.length) {
    await processBatch(batch, { DRY_RUN, failedIds });
    processed += batch.length;
    console.log(`Processed ${processed}/${total}`);
  }

  if (failedIds.length) {
    console.log("Some documents failed to embed/update:", failedIds);
  }

  console.log("Done");
  await mongoose.disconnect();
  process.exit(0);
}

async function processBatch(
  docs: any[],
  { DRY_RUN, failedIds }: { DRY_RUN: boolean; failedIds: string[] }
) {
  for (const d of docs) {
    try {
      const update: any = { updatedAt: new Date() };

      // 1) slug unik
      if (!d.slug || typeof d.slug !== "string" || !d.slug.trim()) {
        update.slug = await uniqueSlug(d.wasteName, d._id);
      } else {
        const intended = await uniqueSlug(d.slug, d._id);
        if (intended !== d.slug) update.slug = intended;
      }

      // 2) normalisasi arrays
      const tags = normStringArray(d.tags);
      const species = normStringArray(d.species);
      const use_cases = normStringArray(d.use_cases);
      if (JSON.stringify(tags) !== JSON.stringify(d.tags || [])) update.tags = tags;
      if (JSON.stringify(species) !== JSON.stringify(d.species || [])) update.species = species;
      if (JSON.stringify(use_cases) !== JSON.stringify(d.use_cases || [])) update.use_cases = use_cases;

      // 3) stock agregat
      const totalStock = await aggregateProductStock(d._id);
      if (typeof d.stock !== "number" || d.stock !== totalStock) update.stock = totalStock;

      // 4) vector embedding (E5 "passage")
      const basis = buildEmbeddingBasis({
        wasteName: d.wasteName,
        description: d.description,
        tags,
      });

      if (basis) {
        try {
          const vec = await embedDoc(basis); // E5 dengan prefix "passage:" + L2-normalize
          update.vector = Array.isArray(vec) && vec.length > 0 ? vec : [];
        } catch (e: any) {
          console.warn(
            `Embedding failed for ${d._id} (${d.wasteName}):`,
            e?.message || e
          );
          if (!d.vector || d.vector.length === 0) update.vector = [];
          failedIds.push(String(d._id));
        }
      } else {
        if (!d.vector || d.vector.length === 0) update.vector = [];
      }

      if (DRY_RUN) {
        console.log("[DRY] would update", d._id.toString(), update);
        continue;
      }

      await FarmWaste.findByIdAndUpdate(d._id, update, { new: false });
    } catch (e) {
      console.error("Backfill error on", d._id.toString(), e);
      failedIds.push(String(d._id));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
