import "dotenv/config";

export const EMBEDDING_MODEL =
  process.env.EDEN_EMBED_MODEL || "infomaniak/mini_lm_l12_v2";
export const EMBEDDING_DIMENSION = 384;

const EDEN_API_URL = "https://api.edenai.run/v3/embeddings";

/**
 * Truncate teks agar tidak melebihi batasan 128 token infomaniak mini_lm_l12_v2
 * (Bahasa Indonesia dengan subword tokenization aman di rentang <= 280 karakter)
 */
function sanitizeInput(text: string): string {
  const trimmed = (text || "").replace(/\s+/g, " ").trim();
  if (trimmed.length <= 280) return trimmed;
  const sliced = trimmed.slice(0, 280);
  const lastSpace = sliced.lastIndexOf(" ");
  return lastSpace > 150 ? sliced.slice(0, lastSpace) : sliced;
}

/**
 * Panggilan embedding ke Eden AI (https://api.edenai.run/v3/embeddings)
 * Model: infomaniak/mini_lm_l12_v2 (384 dimensi, free tier)
 */
async function callEdenAI(input: string | string[]): Promise<number[][]> {
  const apiKey = process.env.EDEN_API_KEY;
  if (!apiKey) {
    throw new Error("EDEN_API_KEY is not configured in .env");
  }

  const safeInput = Array.isArray(input)
    ? input.map(sanitizeInput).filter(Boolean)
    : sanitizeInput(input);

  if (Array.isArray(safeInput) && safeInput.length === 0) return [];
  if (typeof safeInput === "string" && !safeInput) return [];

  const res = await fetch(EDEN_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: safeInput,
    }),
  });

  const json: any = await res.json().catch(() => ({}));

  if (!res.ok || json.error) {
    const errMsg =
      json?.error?.message ||
      json?.detail ||
      `Eden AI HTTP error ${res.status}`;
    const err: any = new Error(errMsg);
    err.status = res.status;
    err.code = json?.error?.code || json?.error?.type;
    throw err;
  }

  if (!json?.data || !Array.isArray(json.data)) {
    throw new Error("Format respons Eden AI tidak valid (tidak ada array data).");
  }

  return json.data.map((item: any) => {
    const emb = item?.embedding;
    if (Array.isArray(emb)) return emb.map(Number);
    if (typeof emb === "string") return JSON.parse(emb).map(Number);
    return [];
  });
}

/**
 * Generate embedding tunggal menggunakan infomaniak/mini_lm_l12_v2 via Eden AI
 */
export async function embedText(text: string): Promise<number[]> {
  const cleanText = (text || "").trim();
  if (!cleanText) return [];

  const results = await callEdenAI(cleanText);
  const vector = results[0];

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("Empty embedding vector returned from Eden AI");
  }

  return vector;
}

/**
 * Alias untuk kompatibilitas pencarian
 */
export const embedQuery = (q: string): Promise<number[]> => embedText(q);

/**
 * Alias untuk embedding dokumen produk
 */
export const embedDoc = (d: string): Promise<number[]> => embedText(d);

/**
 * Batch embed array of texts (efisien untuk backfill dan bulk updates)
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) return [];
  const cleanTexts = texts.map((t) => (t || "").trim()).filter(Boolean);
  if (cleanTexts.length === 0) return [];

  return callEdenAI(cleanTexts);
}
