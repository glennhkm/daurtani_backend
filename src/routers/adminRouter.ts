import { Router } from "express";
import middleware from "../libs/utils/middleware";
import adminController from "../controllers/adminController";

const router = Router();

// Apply admin authorization to all admin routes
router.use(middleware.adminAuthorization);

// Dashboard overview stats
router.get("/stats", adminController.getDashboardStats);

// Transactions management
router.get("/transactions", adminController.getAllTransactions);
router.get("/transactions/:orderId", adminController.getTransactionDetail);
router.patch("/transactions/:orderId/status", adminController.updateTransactionStatusByAdmin);

// Users management
router.get("/users", adminController.getAllUsers);
router.get("/users/:id", adminController.getUserDetail);
router.post("/users/:id/reset-password", adminController.resetUserPasswordByAdmin);

// Stores management
router.get("/stores", adminController.getAllStores);
router.get("/stores/:id", adminController.getStoreDetail);

// Products management, creation, embedding & soft delete
router.get("/products", adminController.getAllProducts);
router.post("/products", adminController.createProductByAdmin);
router.post("/products/embed-missing", adminController.embedMissingProductsByAdmin);
router.get("/products/:id", adminController.getProductDetail);
router.put("/products/:id", adminController.updateProductByAdmin);
router.patch("/products/:id/soft-delete", adminController.toggleProductSoftDelete);
router.patch("/products/:id/toggle-active", adminController.toggleProductActiveByAdmin);
router.post("/products/:id/embed", adminController.embedProductByAdmin);

export default router;
