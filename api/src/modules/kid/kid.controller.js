import { StatusCodes } from 'http-status-codes';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import kidService from './kid.service.js';

const ok = (fn) => catchAsync(async (req, res) => ApiResponse.success(res, { data: await fn(req) }));

export default {
  getMe: ok((req) => kidService.getMe(req.kid)),
  getShelf: ok((req) => kidService.getShelf(req.kid)),
  getUiAudio: ok(() => kidService.getUiAudio()),
  startSession: catchAsync(async (req, res) =>
    ApiResponse.success(res, { statusCode: StatusCodes.CREATED, data: await kidService.startSession(req.kid, req.body.storyId) }),
  ),
  getSession: ok((req) => kidService.getSession(req.kid, req.params.sessionId)),
  saveProgress: ok((req) => kidService.saveProgress(req.kid, req.params.sessionId, req.body.pageId)),
  answer: ok(async (req) => ({ result: await kidService.answer(req.kid, req.params.sessionId, req.body) })),
  complete: ok((req) => kidService.complete(req.kid, req.params.sessionId)),
};
