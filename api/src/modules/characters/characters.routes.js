import { Router } from 'express';
import charactersController from './characters.controller.js';
import charactersValidation from './characters.validation.js';
import { auth, validate } from '../../middlewares/index.js';

const router = Router();

// All character endpoints require authentication (parent token)
router.use(auth);

router
  .route('/')
  .post(validate(charactersValidation.createCharacter), charactersController.createCharacter)
  .get(validate(charactersValidation.getCharacters), charactersController.getCharacters);

router
  .route('/:id')
  .get(validate(charactersValidation.getCharacter), charactersController.getCharacterById)
  .put(validate(charactersValidation.updateCharacter), charactersController.updateCharacter)
  .delete(validate(charactersValidation.deleteCharacter), charactersController.deleteCharacter);

router
  .route('/:id/portrait')
  .post(validate(charactersValidation.generatePortrait), charactersController.generatePortrait);

export default router;
