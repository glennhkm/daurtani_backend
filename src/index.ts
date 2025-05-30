import express, { Request, Response } from "express";
import cors from "cors"; // 🔹 Import cors
import { connectDB } from "./libs/utils/db";
import userRouter from "./routers/userRouter";
import authRouter from "./routers/authRouter";

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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
