import express, { Request, Response } from "express";
import cors from "cors";
import http from "node:http";
import compression from "compression";
import { connectDB } from "./libs/utils/db";
import userRouter from "./routers/userRouter";
import authRouter from "./routers/authRouter";
import farmWasteRouter from "./routers/farmWasteRouter";
import storeRouter from "./routers/storeRouter";
import unitPriceRouter from "./routers/unitPriceRouter";
import cartRouter from "./routers/cartRouter";
import reviewRouter from "./routers/reviewRouter";
import categoryRouter from "./routers/categoryRouter";
import categoryGroupRouter from "./routers/categoryGroupRouter";
import chatRouter from "./routers/chat";

const app = express();
const PORT = Number(process.env.PORT || 5000);

// ===== CORS =====
// Sebaiknya batasi origin ke domain Next.js kamu.
const ALLOWED_ORIGINS = [
  "http://localhost:4000",
  process.env.PUBLIC_SITE_URL || "",   // ex: https://web.daurtani.com
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // allow no-origin requests (mobile app, curl, same-origin)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      // untuk debugging, sementara boleh *:
      return cb(null, true);
      // Production ideal:
      // return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);

// ===== JSON parser =====
app.use(express.json());

// ===== Compression =====
// JANGAN kompres SSE /chat — kita bypass di middleware:
app.use((req, res, next) => {
  if (req.path.startsWith("/chat")) return next(); // bypass compression utk SSE
  return compression()(req, res, next);
});

// ===== Preflight khusus /chat (OPTIONS) =====
app.options("/chat", (req, res) => {
  // Biarkan cors() yg set header; cukup 204.
  res.status(204).end();
});

// ===== Health =====
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "DaurTani API",
    members: [
      { name: "Glenn Hakim", NPM: "2208107010072" },
      { name: "Farhanul Khair", NPM: "220810701007" },
    ],
  });
});

// ===== DB =====
connectDB();

// ===== Routes =====
app.use("/auth", authRouter);
app.use("/users", userRouter);
app.use("/farm-wastes", farmWasteRouter);
app.use("/stores", storeRouter);
app.use("/unit-prices", unitPriceRouter);
app.use("/cart", cartRouter);
app.use("/reviews", reviewRouter);
app.use("/categories", categoryRouter);
app.use("/category-groups", categoryGroupRouter);
app.use("/chat", chatRouter);

// ===== HTTP server + keep-alive untuk stream =====
const server = http.createServer(app);
// Perpanjang timeout biar stream tidak dipotong proxy:
server.keepAliveTimeout = 75_000; // > 60s
server.headersTimeout = 80_000;

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
