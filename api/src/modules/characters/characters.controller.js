import charactersService from './characters.service.js';
import imagesService from '../stories/stories.images.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const createCharacter = catchAsync(async (req, res) => {
  const character = await charactersService.createCharacter(req.user.id, req.body);

  return ApiResponse.created(res, {
    message: 'Tạo nhân vật thành công',
    data: { character },
  });
});

const getCharacters = catchAsync(async (req, res) => {
  const characters = await charactersService.getCharacters(req.user.id, req.query);

  return ApiResponse.success(res, {
    data: { characters },
  });
});

const getCharacterById = catchAsync(async (req, res) => {
  const character = await charactersService.getCharacterById(req.user.id, req.params.id);

  return ApiResponse.success(res, {
    data: { character },
  });
});

const updateCharacter = catchAsync(async (req, res) => {
  const character = await charactersService.updateCharacter(req.user.id, req.params.id, req.body);

  return ApiResponse.success(res, {
    message: 'Cập nhật nhân vật thành công',
    data: { character },
  });
});

const deleteCharacter = catchAsync(async (req, res) => {
  const result = await charactersService.deleteCharacter(req.user.id, req.params.id);

  return ApiResponse.success(res, {
    message: result.message,
  });
});

// Chan dung AI (1 anh, lam anh tham chieu cho tranh canh): giu credit, xep hang, tra 202.
const generatePortrait = catchAsync(async (req, res) => {
  const { aiRequestId } = await imagesService.startPortrait(req.user, req.params.id);
  const character = await charactersService.getCharacterById(req.user.id, req.params.id);
  return ApiResponse.success(res, {
    statusCode: 202,
    message: 'Đang vẽ chân dung nhân vật',
    data: { character, aiRequestId },
  });
});

export default {
  createCharacter,
  getCharacters,
  getCharacterById,
  updateCharacter,
  deleteCharacter,
  generatePortrait,
};
