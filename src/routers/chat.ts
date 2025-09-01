import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import "dotenv/config";
import { embedQuery } from "../libs/services/productVectorSearch/embedding";
import { searchProductsCore } from "../libs/services/productVectorSearch/core";

const chatRouter = Router();

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat-v3-0324:free";

function stamp() {
  const d = new Date();
  return d.toISOString().split("T")[1]!.replace("Z", "");
}
function log(id: string, ...args: any[]) {
  console.log(`[chat][${id}] ${stamp()} |`, ...args);
}

function mapProductForClient(p: any) {
  if (!p?.slug) return null;

  const title = p.wasteName || p.title || p.name || "(Tanpa Judul)";
  const rawDesc = p.description || p.short_desc || "";
  const short_desc =
    (rawDesc || "").length > 180 ? rawDesc.slice(0, 180) + "…" : rawDesc;
  const image =
    Array.isArray(p.imageUrls) && p.imageUrls.length ? p.imageUrls[0] : null;
  const stock = typeof p.stock === "number" ? p.stock : null;
  const score = typeof p.score === "number" ? p.score : undefined;
  const species = Array.isArray(p.species) ? p.species.slice(0, 3) : [];
  const basePath = `/produk/${encodeURIComponent(p.slug)}`;
  const url = `${basePath}?utm_source=chat&utm_medium=cta&utm_campaign=ai_recs`;

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

// ---------- handler utama ----------
chatRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const id = randomUUID?.() || Math.random().toString(36).slice(2, 10);
  const origin = req.headers.origin || "-";
  const ua = req.headers["user-agent"] || "-";

  // Set SSE headers SEKALI sebelum write apa pun
  if (!res.headersSent) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Nginx: matikan buffering
  }
  (res as any).flushHeaders?.();

  // keep-alive ping tiap 20s
  const ping = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch (e) {
      // jika sudah closed, biarkan on('close') yg handle
    }
  }, 20000);

  // Track closed state
  let closed = false;
  const controller = new AbortController();

  req.on("close", () => {
    closed = true;
    controller.abort(); // batalkan call LLM kalau masih jalan
    try { clearInterval(ping); } catch {}
    log(id, "client closed connection");
  });

  const t0 = Date.now();
  try {
    const { messages } = req.body as {
      messages: Array<{ role: string; content: string }>;
    };

    log(id, "request.open from", origin, "| ua:", ua);
    if (!Array.isArray(messages)) {
      res.write(`data: ${JSON.stringify({ content: "Bad request: messages[] wajib ada." })}\n\n`);
      res.write("data: [DONE]\n\n");
      try { clearInterval(ping); } catch {}
      res.end();
      return;
    }

    const last = (messages[messages.length - 1]?.content || "").toLowerCase();
    log(id, "incoming messages count:", messages.length, "| last len:", last.length);

    // ------- Heuristik intent rekomendasi -------
    const wantsRecs = /(sapi|kambing|ayam|ternak|pakan|kompos|biogas|beli|jual|produk|rekomendasi|limbah|sekam|ampas|kulit singkong)/.test(
      last
    );
    log(id, "intent.recs =", wantsRecs);

    // ------- Kirim event PRODUCTS lebih awal -------
    if (wantsRecs && !closed) {
      try {
        const te = Date.now();
        const qVec = await embedQuery(last);
        log(id, `embed.ok dim = ${qVec.length} | took ${Date.now() - te}ms`);

        const ts = Date.now();
        const productsRaw = await searchProductsCore({
          qVector: qVec,
          limit: 5,
          numCandidates: 150,
          minScore: 0.3,
        });
        const bestScore = productsRaw?.[0]?.score ?? 0;
        log(
          id,
          `vector.search.ok items = ${productsRaw.length} | bestScore = ${bestScore.toFixed(
            4
          )} | cfg: { minScore: 0.3, limit: 5, numCandidates: 150 } | took ${Date.now() - ts}ms`
        );

        const mapped = (productsRaw || [])
          .map(mapProductForClient)
          .filter(Boolean) as ReturnType<typeof mapProductForClient>[];

        if (!closed && mapped.length) {
          res.write(`event: PRODUCTS\n`);
          res.write(`data: ${JSON.stringify({ products: mapped })}\n\n`);
          log(id, "sse.PRODUCTS.sent =", mapped.length);
        }
      } catch (err: any) {
        log(id, "recs.phase.error:", err?.message || err);
        // Biarkan chat tetap jalan meskipun rekomendasi gagal
      }
    }

    // ------- Jika klien sudah tutup, jangan lanjut call LLM -------
    if (closed) {
      log(id, "request.finish total", Date.now() - t0, "ms (client closed)");
      return; // ping sudah di-clear di on('close')
    }

    // ------- Panggil OpenRouter (stream) -------
    const body = JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 512,
      stream: true,
    });

    log(id, "openrouter.fetch →", {
      model: MODEL,
      temp: 0.2,
      max_tokens: 512,
    });

    const orRes = await fetch(OR_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_SITE_URL || "http://localhost",
        "X-Title": "DaurTani AI Chat",
      },
      body,
      signal: controller.signal,
    });

    if (!orRes.ok || !orRes.body) {
      log(id, "openrouter.http.error:", orRes.status, orRes.statusText);
      if (!closed) {
        res.write(
          `data: ${JSON.stringify({
            content: "Maaf, layanan sedang padat. Coba lagi ya.",
          })}\n\n`
        );
        res.write("data: [DONE]\n\n");
        try { clearInterval(ping); } catch {}
        res.end();
        return;
      } else {
        try { clearInterval(ping); } catch {}
        return;
      }
    }

    const reader = (orRes.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Stream loop
    while (true) {
      const { value, done } = await reader.read().catch((e) => {
        log(id, "openrouter.stream.error:", e?.name || e);
        throw e;
      });
      if (done) break;
      if (closed) {
        log(id, "openrouter.stream.stop (client already closed)");
        try { reader.releaseLock(); } catch {}
        try { clearInterval(ping); } catch {}
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          if (!closed) {
            res.write("data: [DONE]\n\n");
            try { clearInterval(ping); } catch {}
            res.end();
          }
          log(id, "openrouter.stream.done");
          return;
        }

        try {
          const j = JSON.parse(data);
          const delta = j?.choices?.[0]?.delta?.content;
          if (delta && !closed) {
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        } catch {
          // ignore non-JSON line
        }
      }
    }

    // stream selesai tanpa [DONE]
    if (!closed) {
      res.write("data: [DONE]\n\n");
      try { clearInterval(ping); } catch {}
      res.end();
    }
    log(id, "request.finish total", Date.now() - t0, "ms");
    return;
  } catch (err: any) {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
    }
    const msg =
      err?.name === "AbortError"
        ? "Koneksi ditutup."
        : "Terjadi gangguan jaringan.";
    if (!closed) {
      res.write(`data: ${JSON.stringify({ content: msg })}\n\n`);
      res.write("data: [DONE]\n\n");
      try { clearInterval(ping); } catch {}
      res.end();
    }
    log(id, "handler.catch:", err?.name || err?.message || err);
    return;
  }
});

// (opsional) tangani preflight di level router juga (kalau server global CORS dimatikan)
chatRouter.options("/", (_req: Request, res: Response): void => {
  res.status(204).end();
});

export default chatRouter;
