import { Router } from 'express';
import bookshelfController from './bookshelf.controller.js';
import bookshelfValidation from './bookshelf.validation.js';
import { auth, validate } from '../../middlewares/index.js';

const router = Router();

// All bookshelf operations require authenticated user (parent, kid session, moderator, admin)
router.use(auth);

router.get('/', validate(bookshelfValidation.getBookshelf), bookshelfController.getBookshelf);
router.post('/', validate(bookshelfValidation.addToBookshelf), bookshelfController.addToBookshelf);
router.get('/check/:storyId', validate(bookshelfValidation.checkBookshelf), bookshelfController.checkBookshelf);
router.delete('/:storyId', validate(bookshelfValidation.removeFromBookshelf), bookshelfController.removeFromBookshelf);

export default router;
