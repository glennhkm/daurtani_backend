// services/productSearchCore.ts
import { FarmWaste } from "../../../models/farmWasteModel";
import { Types } from "mongoose";

export async function searchProductsCore({
  qVector, species, use_case, tags, categories,
  limit = 5, numCandidates = 100, minScore = 0.30,
  indexName = "vector",
}: {
  qVector: number[]; species?: string; use_case?: string;
  tags?: string[]; categories?: string[]; limit?: number;
  numCandidates?: number; minScore?: number; indexName?: string;
}) {
  const filter:any = {};
  if (species) filter.species = species;
  if (use_case) filter.use_cases = use_case;
  if (tags?.length) filter.tags = { $in: tags };
  if (categories?.length) filter.categories = { $in: categories.map(id => new Types.ObjectId(id)) };

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
      $project: {
        wasteName: 1, description: 1, slug: 1, imageUrls: 1,
        averageRating: 1, tags: 1, species: 1, use_cases: 1, stock: 1, categories: 1,
        score: { $meta: "vectorSearchScore" },
      }
    }
  ]);

  return rows
    .filter((r:any) => (r.score ?? 0) >= minScore)
    .map((p:any) => ({
      id: p._id,
      title: p.wasteName,
      short_desc: p.description,
      slug: p.slug,
      url: `/marketplace/product/${p.slug}`,
      image: p.imageUrls.length > 0 ? p.imageUrls[0] : null,
      rating: p.averageRating ?? null,
      stock: p.stock ?? null,
      score: p.score,
      badges: [
        ...(p.species?.length ? [`Cocok untuk ${p.species.join(", ")}`] : []),
        ...(p.use_cases?.length ? p.use_cases : []),
      ],
    }));
}
