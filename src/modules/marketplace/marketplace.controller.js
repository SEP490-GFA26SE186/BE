import { StatusCodes } from 'http-status-codes';
import marketplaceService from './marketplace.service.js';

const getPriceTiers = async (_req, res, next) => {
  try {
    const tiers = await marketplaceService.getPriceTiers();
    res.status(StatusCodes.OK).json({
      success: true,
      data: tiers,
    });
  } catch (error) {
    next(error);
  }
};

const registerSeller = async (req, res, next) => {
  try {
    const profile = await marketplaceService.registerSeller(req.user, req.body);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Seller application submitted successfully and pending approval',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

const getMySellerProfile = async (req, res, next) => {
  try {
    const profile = await marketplaceService.getMySellerProfile(req.user);
    res.status(StatusCodes.OK).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

const updateSellerProfile = async (req, res, next) => {
  try {
    const updated = await marketplaceService.updateSellerProfile(req.user, req.body);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Seller profile updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

const getListings = async (req, res, next) => {
  try {
    const result = await marketplaceService.getListings(req.query);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Marketplace listings retrieved successfully',
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

const getListingById = async (req, res, next) => {
  try {
    const listing = await marketplaceService.getListingById(req.params.id, req.user);
    res.status(StatusCodes.OK).json({
      success: true,
      data: listing,
    });
  } catch (error) {
    next(error);
  }
};

const createListing = async (req, res, next) => {
  try {
    const listing = await marketplaceService.createListing(req.user, req.body);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Story listing submitted for moderation review successfully',
      data: listing,
    });
  } catch (error) {
    next(error);
  }
};

const getMyListings = async (req, res, next) => {
  try {
    const listings = await marketplaceService.getMyListings(req.user);
    res.status(StatusCodes.OK).json({
      success: true,
      data: listings,
    });
  } catch (error) {
    next(error);
  }
};

const claimFreeListing = async (req, res, next) => {
  try {
    const result = await marketplaceService.claimFreeListing(req.user, req.params.id);
    res.status(StatusCodes.OK).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const createReview = async (req, res, next) => {
  try {
    const review = await marketplaceService.createReview(req.user, req.params.id, req.body);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Review submitted successfully',
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

const getListingReviews = async (req, res, next) => {
  try {
    const reviews = await marketplaceService.getListingReviews(req.params.id);
    res.status(StatusCodes.OK).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    next(error);
  }
};

const replyReview = async (req, res, next) => {
  try {
    const reply = await marketplaceService.replyReview(
      req.user,
      req.params.reviewId,
      req.body.reply,
    );
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Reply posted successfully',
      data: reply,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getPriceTiers,
  registerSeller,
  getMySellerProfile,
  updateSellerProfile,
  getListings,
  getListingById,
  createListing,
  getMyListings,
  claimFreeListing,
  createReview,
  getListingReviews,
  replyReview,
};
