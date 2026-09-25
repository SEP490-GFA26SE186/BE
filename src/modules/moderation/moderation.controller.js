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

const getBlockedKeywords = async (_req, res, next) => {
  try {
    const keywords = await moderationService.getBlockedKeywords();
    res.status(StatusCodes.OK).json({
      success: true,
      data: keywords,
    });
  } catch (error) {
    next(error);
  }
};

const addBlockedKeyword = async (req, res, next) => {
  try {
    const result = await moderationService.addBlockedKeyword(req.user, req.body);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Blocked keyword added successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const deleteBlockedKeyword = async (req, res, next) => {
  try {
    const result = await moderationService.deleteBlockedKeyword(req.params.id);
    res.status(StatusCodes.OK).json({
      success: true,
      message: result.message,
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

const createReport = async (req, res, next) => {
  try {
    const report = await moderationService.createReport(req.user, req.body);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Content report submitted successfully and queued for inspection',
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

const getReports = async (req, res, next) => {
  try {
    const result = await moderationService.getReports(req.query);
    res.status(StatusCodes.OK).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

const resolveReport = async (req, res, next) => {
  try {
    const result = await moderationService.resolveReport(req.user, req.params.reportId, req.body);
    res.status(StatusCodes.OK).json({
      success: true,
      message: `Report marked as '${result.status}'`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const issueStrike = async (req, res, next) => {
  try {
    const result = await moderationService.issueStrike(req.user, req.body);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: result.sellerSuspended
        ? 'Creator strike issued: Seller account has been SUSPENDED due to reaching strike limit (>= 3)'
        : 'Creator strike issued successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getSellerStrikes = async (req, res, next) => {
  try {
    const strikes = await moderationService.getSellerStrikes(req.params.sellerId);
    res.status(StatusCodes.OK).json({
      success: true,
      data: strikes,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getChecklistItems,
  getBlockedKeywords,
  addBlockedKeyword,
  deleteBlockedKeyword,
  checkText,
  getReviewQueue,
  claimReview,
  submitReviewDecision,
  createReport,
  getReports,
  resolveReport,
  issueStrike,
  getSellerStrikes,
};
