import express, { Request, Response } from "express";
import cors from "cors"; // 🔹 Import cors
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
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));


app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.json(
    { 
      message: "DaurTani API",
      members: [
        {
          name: "Glenn Hakim",
          NPM: "2208107010072"
        },
        {
          name: "Farhanul Khair",
          NPM: "220810701007"
        },          
      ] 

    }
  );
});

connectDB();

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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
