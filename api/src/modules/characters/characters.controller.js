import charactersService from './characters.service.js';
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

const generatePortrait = catchAsync(async (req, res) => {
  const character = await charactersService.requestPortraitGeneration(req.user.id, req.params.id, req.body);

  return ApiResponse.success(res, {
    message: 'Yêu cầu tạo chân dung nhân vật đã được đưa vào hàng đợi',
    data: { character },
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
