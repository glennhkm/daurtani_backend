/**
 * Environment:
 *   HF_TOKEN=hf_...
 *   HF_EMBED_MODEL=intfloat/multilingual-e5-large (default)
 *   HF_PROVIDER=hf-inference  (RECOMMENDED; don't use "auto")
 */
const HF_TOKEN = process.env.HF_TOKEN!;
if (!HF_TOKEN) throw new Error("HF_TOKEN is required in .env");

const HF_EMBED_MODEL =
  process.env.HF_EMBED_MODEL || "intfloat/multilingual-e5-large";

// Force a concrete provider so router knows where to send the call.
// If you *really* want auto, set HF_PROVIDER=auto and configure providers order in HF settings.
// But for reliability, keep hf-inference.
const HF_PROVIDER = process.env.HF_PROVIDER || "hf-inference";

// Router endpoint for feature-extraction
// Docs pattern:
//   https://router.huggingface.co/{provider}/models/{model}/pipeline/feature-extraction
const ENDPOINT = `https://router.huggingface.co/${HF_PROVIDER}/models/${HF_EMBED_MODEL}/pipeline/feature-extraction`;

/* ---------------- Utils ---------------- */
function meanPool(matrix: number[][]): number[] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const out = new Array(cols).fill(0);
  for (let r = 0; r < rows; r++) {
    const row = matrix[r];
    for (let c = 0; c < cols; c++) out[c] += row[c];
  }
  for (let c = 0; c < cols; c++) out[c] /= rows;
  return out;
}

function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

async function fetchWithRetry(body: any, attempt = 0): Promise<any> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  // backoff on 429/5xx
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const backoff = 600 * Math.pow(2, attempt); // 600ms, 1.2s, 2.4s
    await new Promise((r) => setTimeout(r, backoff));
    return fetchWithRetry(body, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HF embedding failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

/* ---------------- Core single ---------------- */
/**
 * E5 multilingual (1024-dim). MUST prefix:
 *   - type "query"   => "query: ..."
 *   - type "passage" => "passage: ..."
 */
export async function embedText(
  text: string,
  type: "query" | "passage" = "passage"
): Promise<number[]> {
  const prefixed = `${type}: ${(text || "").slice(0, 8000)}`;
  const out = await fetchWithRetry({ inputs: prefixed });

  // out can be number[] (already pooled) OR number[][] (per-token)
  let vec: number[];
  if (Array.isArray(out[0])) {
    vec = meanPool(out as number[][]);
  } else {
    vec = out as number[];
  }
  if (!Array.isArray(vec) || vec.length === 0) throw new Error("Empty embedding result");

  return l2Normalize(vec.map(Number));
}

export const embedQuery = (q: string) => embedText(q, "query");
export const embedDoc = (d: string) => embedText(d, "passage");

/* ---------------- Batch (optional) ---------------- */
/**
 * Batch embed (faster for backfill). Returns 1024-dim vectors per item.
 */
export async function embedBatch(
  texts: string[],
  type: "query" | "passage" = "passage"
): Promise<number[][]> {
  if (!texts?.length) return [];
  const inputs = texts.map((t) => `${type}: ${(t || "").slice(0, 8000)}`);
  const out = await fetchWithRetry({ inputs });

  // Possible shapes:
  // - number[][] (each item already [dim])
  // - number[][][] (each item [seq_len, dim]) → need pooling
  if (!Array.isArray(out)) throw new Error("Unexpected embedding batch output");

  const first = out[0];
  const itemIsVector = Array.isArray(first) && typeof first[0] === "number";

  if (itemIsVector) {
    return (out as number[][]).map((v) => l2Normalize(v.map(Number)));
  }
  // per-token → pool each
  return (out as number[][][]).map((mat) => l2Normalize(meanPool(mat as number[][])));
}
