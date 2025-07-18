import { Router, Request, Response } from "express";
import cartController from "../controllers/cartController";
import middleware from "../libs/utils/middleware";

const router = Router();

// Get user's cart
router.get("/", middleware.authorization, (req: Request, res: Response) => cartController.getUserCart(req, res));

// Add item to cart
router.post("/add", middleware.authorization, (req: Request, res: Response) => cartController.addItemToCart(req, res));

// Update cart item
router.put("/item/:itemId", middleware.authorization, (req: Request, res: Response) => cartController.updateCartItem(req, res));

// Remove item from cart
router.delete("/item/:itemId", middleware.authorization, (req: Request, res: Response) => cartController.removeCartItem(req, res));

// Clear cart
router.delete("/clear", middleware.authorization, (req: Request, res: Response) => cartController.clearCart(req, res));

export default router; 