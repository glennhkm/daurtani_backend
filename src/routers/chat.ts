import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import "dotenv/config";
import { embedQuery } from "../libs/services/productVectorSearch/embedding";
import { searchProductsCore } from "../libs/services/productVectorSearch/core";

const chatRouter = Router();

// ====== Heuristik intent sederhana ======
function wantsRecommendations(text: string) {
  const t = (text || "").toLowerCase();
  return /(sapi|kambing|ayam|ternak|pakan|kompos|biogas|beli|jual|produk|rekomendasi|limbah|sekam|ampas|kulit singkong|padi)/.test(
    t
  );
}

// ====== Mapper produk → payload aman untuk UI ======
function mapProductForClient(p: any) {
  if (!p?.slug) return null; // anti-halusinasi, pastikan slug ada

  const title = p.wasteName || p.title || p.name || "(Tanpa Judul)";
  const rawDesc = p.description || p.short_desc || "";
  const short_desc = rawDesc.length > 180 ? rawDesc.slice(0, 180) + "…" : rawDesc;

  const image = p.image ?? null;

  const stock = typeof p.stock === "number" ? p.stock : null;
  const score = typeof p.score === "number" ? p.score : undefined;
  const species = Array.isArray(p.species) ? p.species.slice(0, 3) : [];

  const basePath = `/marketplace/product/${encodeURIComponent(p.slug)}`;
  const url = `${basePath}?utm_source=chat&utm_medium=cta&utm_campaign=ai_recs`;

  // (opsional) price/unit jika pipeline kamu mengisi itu di core
  const price = p.price ?? null;
  const unit = p.unit ?? null;

  return {
    id: String(p._id || p.id || p.slug),
    slug: p.slug,
    title,
    short_desc,
    image,
    stock,
    score,
    species,
    price,
    unit,
    url,
  };
}

/**
 * POST /chat
 * Body:
 *  - query?: string   // alternatif langsung teks
 *  - messages?: {role: string, content: string}[]
 *
 * Return: { products: ProductClient[], meta: {...} }
 */
chatRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const rid = randomUUID();
  const started = Date.now();

  try {
    const { query, messages } = req.body || {};
    const last: string =
      typeof query === "string"
        ? query
        : Array.isArray(messages) && messages.length
        ? String(messages[messages.length - 1]?.content || "")
        : "";

    console.log(
      `[recs][${rid}] open | hasQuery=${!!query} | messages=${Array.isArray(messages) ? messages.length : 0
      } | last.len=${last.length}`
    );

    if (!last.trim()) {
      const ms = Date.now() - started;
      console.log(`[recs][${rid}] 400 no content | ${ms}ms`);
      res.status(400).json({
        error: "query atau messages (dengan user message terakhir) wajib ada.",
      });
      return;
    }

    // Jika user tak berniat minta rekomendasi, kita jawab kosong tapi sukses 200
    const intent = wantsRecommendations(last);
    console.log(`[recs][${rid}] intent.recs=${intent}`);

    if (!intent) {
      const ms = Date.now() - started;
      console.log(`[recs][${rid}] 200 no-intent | ${ms}ms`);
      res.status(200).json({
        products: [],
        meta: {
          intent: false,
          tookMs: ms,
        },
      });
      return;
    }

    // ==== Phase 1: embed ====
    const t0 = Date.now();
    const qVector = await embedQuery(last);
    const t1 = Date.now();
    console.log(`[recs][${rid}] embed.ok | dim=${qVector.length} | ${t1 - t0}ms`);

    // ==== Phase 2: vector search (anti-halusinasi: semua dari DB) ====
    const cfg = { limit: 3, numCandidates: 150, minScore: 0.3 };
    const productsRaw = await searchProductsCore({
      qVector,
      ...cfg,
    });
    const t2 = Date.now();

    console.log(
      `[recs][${rid}] search.ok | items=${productsRaw.length
      } | bestScore=${productsRaw[0]?.score?.toFixed?.(4) ?? "n/a"} | ${t2 - t1}ms`
    );

    const products = (productsRaw || [])
      .map(mapProductForClient)
      .filter(Boolean) as ReturnType<typeof mapProductForClient>[];

    const ms = Date.now() - started;
    console.log(
      `[recs][${rid}] 200 ok | products=${products.length} | total ${ms}ms`
    );

    res.status(200).json({
      products,
      meta: {
        intent: true,
        tookMs: ms,
        cfg,
      },
    });
    return;
  } catch (err: any) {
    const ms = Date.now() - started;
    console.error(`[recs][${rid}] 500 error:`, err?.message || err);
    res.status(500).json({
      error: "Gagal membuat rekomendasi.",
      meta: { tookMs: ms },
    });
    return;
  }
});

export default chatRouter;
