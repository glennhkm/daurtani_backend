import { Request, Response } from "express";
import { Review } from "../models/reviewModel";
import { FarmWaste } from "../models/farmWasteModel";
import { Store } from "../models/storeModel";
import { User } from "../models/userModel";
import { AuthRequest } from "./storeController";
import response from "../libs/utils/responses";
import mongoose from "mongoose";

// Create a new review and update average ratings
const createReview = async (req: AuthRequest, res: Response): Promise<void> => {
  const { farmWasteId, rating, description, images } = req.body;
  const userId = req.user?.id;
  
  try {
    // Check if user has already reviewed this product
    // const existingReview = await Review.findOne({ userId, farmWasteId });
    // if (existingReview) {
    //   response.sendBadRequest(res, "You have already reviewed this product");
    //   return;
    // }

    // Create review
    const review = await Review.create({
      userId,
      farmWasteId,
      rating,
      description,
      images,
    });

    // Update farm waste average rating
    const allReviews = await Review.find({ farmWasteId });
    const averageRating = allReviews.reduce((sum, review) => sum + review.rating, 0) / allReviews.length;
    
    const farmWaste = await FarmWaste.findByIdAndUpdate(
      farmWasteId,
      { averageRating: Math.round(averageRating * 10) / 10 }, // Round to 1 decimal place
      { new: true }
    );

    // Update store average rating
    if (farmWaste) {
      const storeId = farmWaste.storeId;
      const storeProducts = await FarmWaste.find({ storeId });
      
      // Calculate store average rating based only on products that have reviews
      const productsWithReviews = storeProducts.filter(product => product.averageRating !== undefined && product.averageRating > 0);
      const storeAverageRating = productsWithReviews.length > 0 
        ? productsWithReviews.reduce((sum, product) => sum + (product.averageRating || 0), 0) / productsWithReviews.length
        : 0;
      
      await Store.findByIdAndUpdate(
        storeId,
        { averageRating: Math.round(storeAverageRating * 10) / 10 }, // Round to 1 decimal place
        { new: true }
      );
    }

    // Return review with user info
    const reviewWithUserInfo = {
      ...review.toObject(),
      user: {
        fullName: req.user?.fullName || "Anonymous",
        email: req.user?.email || "",
      }
    };
    
    response.sendCreated(res, {
      data: reviewWithUserInfo,
      message: "Review created successfully",
    });
  } catch (error: any) {
    response.sendInternalError(res, error.message || "Failed to create review");
  }
};

// Get reviews for a farm waste product with user info
const getReviews = async (req: Request, res: Response): Promise<void> => {
  const { farmWasteId } = req.params;
  
  try {
    if (!mongoose.Types.ObjectId.isValid(farmWasteId)) {
      response.sendBadRequest(res, "Invalid product ID");
      return;
    }

    const reviews = await Review.find({ farmWasteId }).sort({ createdAt: -1 });
    
    // Fetch user info for each review
    const reviewsWithUserInfo = await Promise.all(
      reviews.map(async (review) => {
        const user = await User.findById(review.userId).select('fullName email');
        return {
          ...review.toObject(),
          user: {
            fullName: user?.fullName || "Anonymous",
            email: user?.email || "",
          }
        };
      })
    );
    
    response.sendSuccess(res, { 
      data: reviewsWithUserInfo, 
      message: "Reviews retrieved successfully" 
    });
  } catch (error: any) {
    response.sendInternalError(res, error.message || "Failed to get reviews");
  }
};

// Delete a review
const deleteReview = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user?.id;
  
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      response.sendBadRequest(res, "Invalid review ID");
      return;
    }

    // Find the review
    const review = await Review.findById(id);
    
    if (!review) {
      response.sendNotFound(res, "Review not found");
      return;
    }
    
    // Check if the user is the owner of the review
    if (review.userId.toString() !== userId) {
      response.sendUnauthorized(res, "You can only delete your own reviews");
      return;
    }
    
    // Get farmWasteId before deleting
    const farmWasteId = review.farmWasteId;
    
    // Delete the review
    await Review.findByIdAndDelete(id);
    
    // Update farm waste average rating
    const allReviews = await Review.find({ farmWasteId });
    let averageRating = 0;
    
    if (allReviews.length > 0) {
      averageRating = allReviews.reduce((sum, review) => sum + review.rating, 0) / allReviews.length;
    }
    
    const farmWaste = await FarmWaste.findByIdAndUpdate(
      farmWasteId,
      { averageRating: Math.round(averageRating * 10) / 10 }, // Round to 1 decimal place
      { new: true }
    );
    
    // Update store average rating
    if (farmWaste) {
      const storeId = farmWaste.storeId;
      const storeProducts = await FarmWaste.find({ storeId });
      
      // Calculate store average rating based on all products
      let storeAverageRating = 0;
      if (storeProducts.length > 0) {
        storeAverageRating = storeProducts.reduce((sum, product) => {
          return sum + (product.averageRating || 0);
        }, 0) / storeProducts.length;
      }
      
      await Store.findByIdAndUpdate(
        storeId,
        { averageRating: Math.round(storeAverageRating * 10) / 10 }, // Round to 1 decimal place
        { new: true }
      );
    }
    
    response.sendSuccess(res, {
      message: "Review deleted successfully",
    });
  } catch (error: any) {
    response.sendInternalError(res, error.message || "Failed to delete review");
  }
};

export default {
  createReview,
  getReviews,
  deleteReview,
};
