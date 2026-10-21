import { Router } from 'express';
import { auth, authorize, validate } from '../../middlewares/index.js';
import controller from './question-templates.controller.js';
import validation from './question-templates.validation.js';

const router = Router();
router.use(auth, authorize('specialist', 'admin'));

router.get('/', validate(validation.list), controller.list);
router.post('/', validate(validation.create), controller.create);
router.put('/:id', validate(validation.update), controller.update);
router.put('/:id/draft', validate(validation.draft), controller.saveDraft);
router.post('/:id/publish', validate(validation.publish), controller.publish);
router.delete('/:id', validate(validation.remove), controller.remove);

export default router;
