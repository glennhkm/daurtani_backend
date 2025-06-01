import { Router, Request, Response } from "express";
import reviewController from "../controllers/reviewController";
import middleware from "../libs/utils/middleware";

const reviewRouter = Router();

// Create a new review
reviewRouter.post("/", middleware.authorization, reviewController.createReview);

// Get all reviews for a product
reviewRouter.get("/:farmWasteId", reviewController.getReviews);

// Delete a review
reviewRouter.delete("/:id", middleware.authorization, reviewController.deleteReview);

export default reviewRouter;

