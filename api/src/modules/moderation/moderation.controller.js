import { StatusCodes } from 'http-status-codes';
import moderationService from './moderation.service.js';

const getChecklistItems = async (_req, res, next) => {
  try {
    const items = await moderationService.getChecklistItems();
    res.status(StatusCodes.OK).json({
      success: true,
      data: items,
    });
  } catch (error) {
    next(error);
  }
};

const checkText = async (req, res, next) => {
  try {
    const result = await moderationService.checkTextAgainstKeywords(req.body.text);
    res.status(StatusCodes.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getReviewQueue = async (req, res, next) => {
  try {
    const result = await moderationService.getReviewQueue(req.query);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Review queue retrieved successfully',
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

const claimReview = async (req, res, next) => {
  try {
    const result = await moderationService.claimReview(req.user, req.params.listingId);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Listing claimed for moderation review successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const submitReviewDecision = async (req, res, next) => {
  try {
    const result = await moderationService.submitReviewDecision(
      req.user,
      req.params.reviewId,
      req.body,
    );
    res.status(StatusCodes.OK).json({
      success: true,
      message: `Moderation decision '${result.decision}' recorded successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getChecklistItems,
  checkText,
  getReviewQueue,
  claimReview,
  submitReviewDecision,
};
