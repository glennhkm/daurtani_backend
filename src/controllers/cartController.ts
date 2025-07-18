import { Request, Response } from "express";
import { Cart } from "../models/cartModel";
import { CartItem } from "../models/cartItemModel";
import { UnitPrice } from "../models/unitPriceModel";
import { FarmWaste } from "../models/farmWasteModel";
import { Store } from "../models/storeModel";
import mongoose from "mongoose";
import response from "../libs/utils/responses";

// Define AuthRequest interface to include user property
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName: string;
    supabaseId: string;
  };
}

// Get or create user's cart
const getUserCart = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return response.sendUnauthorized(res, "User not authenticated");
    }

    // Find or create cart
    let cart = await Cart.findOne({ userId });
    
    if (!cart) {
      cart = await Cart.create({ userId });
    }

    // Get cart items
    const cartItems = await CartItem.find({ cartId: cart._id });
    
    // Get farm waste details for each cart item
    const farmWasteIds = cartItems.map(item => item.farmWasteId);
    const farmWastes = await FarmWaste.find({
      _id: { $in: farmWasteIds }
    });
    
    // Get store details for each farm waste
    const storeIds = farmWastes.map(waste => waste.storeId);
    const stores = await Store.find({
      _id: { $in: storeIds }
    });

    // Map cart items with their details
    const cartItemsWithDetails = await Promise.all(
      cartItems.map(async (item) => {
        const farmWaste = farmWastes.find(
          waste => (waste._id as mongoose.Types.ObjectId).toString() === item.farmWasteId.toString()
        );
        
        const store = stores.find(
          store => farmWaste && (store._id as mongoose.Types.ObjectId).toString() === farmWaste.storeId.toString()
        );
        
        const unitPrice = await UnitPrice.findById(item.unitsPriceId);
        
        return {
          _id: item._id,
          quantity: item.quantity,
          unit: item.unit,
          pricePerUnit: item.pricePerUnit,
          totalPriceItem: item.totalPriceItem,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          product: {
            _id: farmWaste?._id,
            wasteName: farmWaste?.wasteName,
            description: farmWaste?.description,
            imageUrls: farmWaste?.imageUrls || [],
            averageRating: farmWaste?.averageRating || 0,
          },
          store: {
            _id: store?._id,
            storeName: store?.storeName,
            provinsi: store?.provinsi,
            kota: store?.kota,
            kecamatan: store?.kecamatan,
            detailAlamat: store?.detailAlamat,
          },
          unitPrice: {
            _id: unitPrice?._id,
            unit: unitPrice?.unit,
            pricePerUnit: unitPrice?.pricePerUnit,
            stock: unitPrice?.stock,
            isBaseUnit: unitPrice?.isBaseUnit,
            equalWith: unitPrice?.equalWith,
          },
        };
      })
    );

    // Calculate total price
    const totalPrice = cartItemsWithDetails.reduce(
      (total, item) => total + item.totalPriceItem,
      0
    );

    response.sendSuccess(res, {
      data: cartItemsWithDetails,
      totalItems: cartItemsWithDetails.length,
      totalPrice: totalPrice,
      message: "Cart retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error fetching cart:", error);
    response.sendInternalError(res, error.message || "Failed to fetch cart");
  }
};

// Add item to cart
const addItemToCart = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { farmWasteId, unitsPriceId, quantity } = req.body;

    if (!userId) {
      return response.sendUnauthorized(res, "User not authenticated");
    }

    // Validate farm waste and unit price
    const farmWaste = await FarmWaste.findById(farmWasteId);
    if (!farmWaste) {
      response.sendNotFound(res, "Farm waste not found");
      return;
    }

    const unitPrice = await UnitPrice.findById(unitsPriceId);
    if (!unitPrice) {
      response.sendNotFound(res, "Unit price not found");
      return;
    }

    // Check if the unit price belongs to the farm waste
    if (unitPrice.farmWasteId.toString() !== farmWasteId) {
      response.sendBadRequest(res, "Unit price does not belong to this farm waste");
      return;
    }

    // Check stock availability
    if (unitPrice.stock !== undefined && unitPrice.stock < quantity) {
      response.sendBadRequest(res, "Not enough stock available");
      return;
    }

    // Find or create cart
    let cart = await Cart.findOne({ userId });
    
    if (!cart) {
      cart = await Cart.create({ userId });
    }

    // Check if item already exists in cart
    const existingItem = await CartItem.findOne({
      cartId: cart._id,
      farmWasteId,
      unitsPriceId,
    });

    if (existingItem) {
      // Update existing item
      const newQuantity = existingItem.quantity + quantity;
      
      // Check stock again for the new quantity
      if (unitPrice.stock !== undefined && unitPrice.stock < newQuantity) {
        response.sendBadRequest(res, "Not enough stock available");
        return;
      }
      
      const updatedItem = await CartItem.findByIdAndUpdate(
        existingItem._id,
        {
          quantity: newQuantity,
          totalPriceItem: unitPrice.pricePerUnit * newQuantity,
          updatedAt: new Date(),
        },
        { new: true }
      );

      response.sendSuccess(res, {
        message: "Cart item updated successfully",
        data: updatedItem,
      });
    } else {
      // Create new cart item
      const newCartItem = await CartItem.create({
        farmWasteId,
        unitsPriceId,
        cartId: cart._id,
        quantity,
        unit: unitPrice.unit,
        pricePerUnit: unitPrice.pricePerUnit,
        totalPriceItem: unitPrice.pricePerUnit * quantity,
      });

      response.sendCreated(res, {
        message: "Item added to cart successfully",
        data: newCartItem,
      });
    }
  } catch (error: any) {
    console.error("Error adding item to cart:", error);
    response.sendInternalError(res, error.message || "Failed to add item to cart");
  }
};

// Update cart item quantity
const updateCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      response.sendBadRequest(res, "Invalid cart item ID");
      return;
    }

    // Find cart item
    const cartItem = await CartItem.findById(itemId);
    if (!cartItem) {
      response.sendNotFound(res, "Cart item not found");
      return;
    }

    // Check unit price and stock
    const unitPrice = await UnitPrice.findById(cartItem.unitsPriceId);
    if (!unitPrice) {
      response.sendNotFound(res, "Unit price not found");
      return;
    }

    // Check stock availability
    if (unitPrice.stock !== undefined && unitPrice.stock < quantity) {
      response.sendBadRequest(res, "Not enough stock available");
      return;
    }

    // Update cart item
    const updatedItem = await CartItem.findByIdAndUpdate(
      itemId,
      {
        quantity,
        totalPriceItem: unitPrice.pricePerUnit * quantity,
        updatedAt: new Date(),
      },
      { new: true }
    );

    response.sendSuccess(res, {
      message: "Cart item updated successfully",
      data: updatedItem,
    });
  } catch (error: any) {
    console.error("Error updating cart item:", error);
    response.sendInternalError(res, error.message || "Failed to update cart item");
  }
};

// Remove item from cart
const removeCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      response.sendBadRequest(res, "Invalid cart item ID");
      return;
    }

    // Find and delete cart item
    const cartItem = await CartItem.findByIdAndDelete(itemId);
    
    if (!cartItem) {
      response.sendNotFound(res, "Cart item not found");
      return;
    }

    response.sendSuccess(res, {
      message: "Cart item removed successfully",
    });
  } catch (error: any) {
    console.error("Error removing cart item:", error);
    response.sendInternalError(res, error.message || "Failed to remove cart item");
  }
};

// Clear cart
const clearCart = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return response.sendUnauthorized(res, "User not authenticated");
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    
    if (!cart) {
      response.sendNotFound(res, "Cart not found");
      return;
    }

    // Delete all cart items
    await CartItem.deleteMany({ cartId: cart._id });

    response.sendSuccess(res, {
      message: "Cart cleared successfully",
    });
  } catch (error: any) {
    console.error("Error clearing cart:", error);
    response.sendInternalError(res, error.message || "Failed to clear cart");
  }
};

export default {
  getUserCart,
  addItemToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
}; 