import { FarmWaste } from "../../../models/farmWasteModel";
import { Types } from "mongoose";

/**
 * Menghitung cosine similarity antara dua vektor float
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA?.length || !vecB?.length || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function mapProductOutput(p: any, score: number) {
  return {
    id: p._id,
    title: p.wasteName,
    short_desc: p.description,
    slug: p.slug,
    url: `/marketplace/product/${p.slug}`,
    image: p.imageUrls?.length > 0 ? p.imageUrls[0] : null,
    rating: p.averageRating ?? null,
    stock: p.stock ?? null,
    score,
    badges: [
      ...(p.species?.length ? [`Cocok untuk ${p.species.join(", ")}`] : []),
      ...(p.use_cases?.length ? p.use_cases : []),
    ],
  };
}

export async function searchProductsCore({
  qVector,
  species,
  use_case,
  tags,
  categories,
  limit = 5,
  numCandidates = 100,
  minScore = 0.5,
  indexName = "vector",
}: {
  qVector: number[];
  species?: string;
  use_case?: string;
  tags?: string[];
  categories?: string[];
  limit?: number;
  numCandidates?: number;
  minScore?: number;
  indexName?: string;
}) {
  if (!qVector || !Array.isArray(qVector) || qVector.length === 0) {
    return [];
  }

  const filter: any = {};
  if (species) filter.species = species;
  if (use_case) filter.use_cases = use_case;
  if (tags?.length) filter.tags = { $in: tags };
  if (categories?.length) {
    filter.categories = { $in: categories.map((id) => new Types.ObjectId(id)) };
  }

  // 1. Primary Strategy: MongoDB Atlas $vectorSearch
  try {
    const rows = await FarmWaste.aggregate([
      {
        $vectorSearch: {
          index: indexName,
          path: "vector",
          queryVector: qVector,
          limit,
          numCandidates,
          ...(Object.keys(filter).length ? { filter } : {}),
        },
      },
      {
        $match: {
          isDeleted: { $ne: true },
          isActive: { $ne: false },
        },
      },
      {
        $project: {
          wasteName: 1,
          description: 1,
          slug: 1,
          imageUrls: 1,
          averageRating: 1,
          tags: 1,
          species: 1,
          use_cases: 1,
          stock: 1,
          categories: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);

    const filtered = (rows || [])
      .filter((r: any) => (r.score ?? 0) >= minScore)
      .map((p: any) => mapProductOutput(p, p.score));

    if (filtered.length > 0) {
      return filtered;
    }
  } catch (error: any) {
    console.warn(
      `[vectorSearch] Atlas $vectorSearch gagal/tidak tersedia: ${error?.message || error}. Menggunakan in-memory vector fallback.`
    );
  }

  // 2. Fallback Strategy: In-memory Cosine Similarity across MongoDB documents
  try {
    const query: any = {
      isDeleted: { $ne: true },
      isActive: { $ne: false },
      vector: { $exists: true, $ne: [] },
      ...filter,
    };

    const candidates = await FarmWaste.find(query)
      .select("wasteName description slug imageUrls averageRating tags species use_cases stock categories vector")
      .lean();

    const scored = candidates
      .filter((c: any) => Array.isArray(c.vector) && c.vector.length === qVector.length)
      .map((c: any) => {
        const score = cosineSimilarity(qVector, c.vector);
        return {
          ...c,
          score,
        };
      })
      .filter((c) => c.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((p: any) => mapProductOutput(p, p.score));
  } catch (fallbackError: any) {
    console.error("[vectorSearch] Fallback in-memory error:", fallbackError);
    return [];
  }
}
