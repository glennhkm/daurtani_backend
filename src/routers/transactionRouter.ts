import { Router } from "express";
import middleware from "../libs/utils/middleware";
import transactionController from "../controllers/transactionController";

const router = Router();

// Create transaction (init payment)
router.post("/", middleware.authorization, transactionController.createTransaction);

// List user transactions
router.get("/", middleware.authorization, transactionController.listUserTransactions);

// Get single transaction
router.get("/:orderId", middleware.authorization, transactionController.getTransactionByOrderId);

// Update status (protected - in real scenario this should be webhook secret validated)
router.patch("/:orderId/status", transactionController.updateTransactionStatus);

export default router;
