import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import "dotenv/config";
import { embedQuery } from "../libs/services/productVectorSearch/embedding";
import { searchProductsCore } from "../libs/services/productVectorSearch/core";
import { FarmWaste } from "../models/farmWasteModel";

const chatRouter = Router();

// ====== Heuristik intent rekomendasi produk ======
function wantsRecommendations(text: string) {
  const t = (text || "").toLowerCase();
  return /(sapi|kambing|ayam|ternak|pakan|kompos|biogas|beli|jual|produk|rekomendasi|limbah|sekam|ampas|kulit singkong|padi|batok|kelapa|tempurung|briket|arang|shisha|karbon|serabut|sabut|cocopeat|jerami|tongkol|jagung|tebu|sawit|pupuk|media tanam|kalori|abu|stok|harga|aceh|toko|cari|butuh|kopi|kulit kopi|pisang|batang pisang|tani|order|pesan|supplier|katalog|bahan)/.test(
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

    // ==== Phase 1: embed via OpenRouter ====
    let qVector: number[] = [];
    const t0 = Date.now();
    try {
      qVector = await embedQuery(last);
      const t1 = Date.now();
      console.log(`[recs][${rid}] embed.ok | dim=${qVector.length} | ${t1 - t0}ms`);
    } catch (embedErr: any) {
      console.warn(`[recs][${rid}] embed.failed (${embedErr?.message || embedErr}). Falling back to keyword search.`);
    }

    // ==== Phase 2: vector search (anti-halusinasi: semua dari DB) ====
    const cfg = { limit: 3, numCandidates: 150, minScore: 0.3 };
    let productsRaw: any[] = [];

    if (qVector && qVector.length > 0) {
      productsRaw = await searchProductsCore({
        qVector,
        ...cfg,
      });
      const t2 = Date.now();
      console.log(
        `[recs][${rid}] vectorSearch.ok | items=${productsRaw.length
        } | bestScore=${productsRaw[0]?.score?.toFixed?.(4) ?? "n/a"} | ${t2 - t0}ms`
      );
    }

    // Fallback search jika vector search tidak menghasilkan produk atau embedding gagal
    if (!productsRaw || productsRaw.length === 0) {
      const keywords = last
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3);

      if (keywords.length > 0) {
        const regexList = keywords.map((k) => new RegExp(k, "i"));
        const fallbackDocs = await FarmWaste.find({
          isDeleted: { $ne: true },
          $or: [
            { wasteName: { $in: regexList } },
            { tags: { $in: regexList } },
            { species: { $in: regexList } },
            { use_cases: { $in: regexList } },
            { description: { $in: regexList } },
          ],
        })
          .limit(cfg.limit)
          .lean();

        productsRaw = fallbackDocs.map((p: any) => ({
          id: p._id,
          title: p.wasteName,
          short_desc: p.description,
          slug: p.slug,
          url: `/marketplace/product/${p.slug}`,
          image: p.imageUrls?.length > 0 ? p.imageUrls[0] : null,
          rating: p.averageRating ?? null,
          stock: p.stock ?? null,
          score: 0.5,
          badges: [
            ...(p.species?.length ? [`Cocok untuk ${p.species.join(", ")}`] : []),
            ...(p.use_cases?.length ? p.use_cases : []),
          ],
        }));
      }
    }

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

/**
 * POST /chat/completions
 * Proxy / direct completion and streaming endpoint powered by Groq LLM
 */
chatRouter.post("/completions", async (req: Request, res: Response): Promise<void> => {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    res.status(500).json({
      error: "GROQ_API_KEY belum dikonfigurasi di server backend.",
    });
    return;
  }

  const { messages, model, max_tokens, temperature, stream } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "messages array wajib disertakan." });
    return;
  }

  const client = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: groqKey,
  });

  const selectedModel =
    model || process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const upstream = await client.chat.completions.create({
        model: selectedModel,
        messages,
        stream: true,
        temperature: typeof temperature === "number" ? temperature : 0.6,
        max_tokens: typeof max_tokens === "number" ? max_tokens : 1500,
      });

      for await (const chunk of upstream) {
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (delta) {
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      console.error("[Groq Backend Stream Error]:", err?.message || err);
      res.write(
        `data: ${JSON.stringify({
          error: err?.message || "Terjadi kesalahan streaming Groq.",
        })}\n\n`
      );
      res.end();
    }
    return;
  }

  try {
    const completion = await client.chat.completions.create({
      model: selectedModel,
      messages,
      stream: false,
      temperature: typeof temperature === "number" ? temperature : 0.6,
      max_tokens: typeof max_tokens === "number" ? max_tokens : 1500,
    });
    res.status(200).json(completion);
  } catch (err: any) {
    console.error("[Groq Backend Completion Error]:", err?.message || err);
    res.status(500).json({
      error:
        err?.message || "Gagal menghasilkan respons AI dari Groq.",
    });
  }
});

export default chatRouter;
