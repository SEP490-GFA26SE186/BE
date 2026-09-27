import { StatusCodes } from 'http-status-codes';
import bookshelfService from './bookshelf.service.js';

const getBookshelf = async (req, res, next) => {
  try {
    const result = await bookshelfService.getBookshelf(req.user, req.query);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Bookshelf retrieved successfully',
      data: result.items,
      child: result.child,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

const addToBookshelf = async (req, res, next) => {
  try {
    const result = await bookshelfService.addToBookshelf(req.user, req.body);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: result.alreadyInBookshelf
        ? 'Story is already in bookshelf'
        : 'Story added to bookshelf successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const removeFromBookshelf = async (req, res, next) => {
  try {
    const result = await bookshelfService.removeFromBookshelf(req.user, {
      childId: req.query.childId,
      storyId: req.params.storyId,
    });
    res.status(StatusCodes.OK).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

const checkBookshelf = async (req, res, next) => {
  try {
    const result = await bookshelfService.checkBookshelf(req.user, {
      childId: req.query.childId,
      storyId: req.params.storyId,
    });
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Bookshelf status checked',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getBookshelf,
  addToBookshelf,
  removeFromBookshelf,
  checkBookshelf,
};
