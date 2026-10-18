import { StatusCodes } from 'http-status-codes';
import readingSessionsService from './reading-sessions.service.js';

const startSession = async (req, res, next) => {
  try {
    const result = await readingSessionsService.startSession(req.user, req.body);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: result.session.isResumed
        ? 'Reading session resumed successfully'
        : 'Reading session started successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getSession = async (req, res, next) => {
  try {
    const session = await readingSessionsService.getSession(req.user, req.params.sessionId);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Reading session retrieved successfully',
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

const updateProgress = async (req, res, next) => {
  try {
    const result = await readingSessionsService.updateProgress(req.user, req.params.sessionId, req.body);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Reading progress saved successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const submitAnswer = async (req, res, next) => {
  try {
    const result = await readingSessionsService.submitAnswer(req.user, req.params.sessionId, req.body);
    res.status(result.alreadyAnswered ? StatusCodes.OK : StatusCodes.CREATED).json({
      success: true,
      message: result.alreadyAnswered
        ? 'Checkpoint was already answered in this session'
        : 'Checkpoint answer recorded successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const completeSession = async (req, res, next) => {
  try {
    const result = await readingSessionsService.completeSession(req.user, req.params.sessionId);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Reading session completed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getChildHistory = async (req, res, next) => {
  try {
    const result = await readingSessionsService.getChildHistory(
      req.user,
      req.params.childId,
      req.query,
    );
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Child reading history retrieved successfully',
      data: result.sessions,
      child: result.child,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  startSession,
  getSession,
  updateProgress,
  submitAnswer,
  completeSession,
  getChildHistory,
};
