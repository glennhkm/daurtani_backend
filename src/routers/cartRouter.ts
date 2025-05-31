import { Router, Request, Response } from "express";
import cartController from "../controllers/cartController";

const router = Router();

// Get user's cart
router.get("/user/:userId", (req: Request, res: Response) => cartController.getUserCart(req, res));

// Add item to cart
router.post("/user/:userId/add", (req: Request, res: Response) => cartController.addItemToCart(req, res));

// Update cart item
router.put("/item/:itemId", (req: Request, res: Response) => cartController.updateCartItem(req, res));

// Remove item from cart
router.delete("/item/:itemId", (req: Request, res: Response) => cartController.removeCartItem(req, res));

// Clear cart
router.delete("/user/:userId/clear", (req: Request, res: Response) => cartController.clearCart(req, res));

export default router; 