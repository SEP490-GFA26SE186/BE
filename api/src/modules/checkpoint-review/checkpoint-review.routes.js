import { Router } from 'express';
import { auth, authorize, validate } from '../../middlewares/index.js';
import controller from './checkpoint-review.controller.js';
import validation from './checkpoint-review.validation.js';

const router = Router();
router.use(auth, authorize('specialist', 'admin'));

router.get('/stats', controller.stats);
router.get('/', validate(validation.list), controller.list);
router.post('/:checkpointId/ok', validate(validation.id), controller.markOk);
router.post('/:checkpointId/flag', validate(validation.flag), controller.flag);
router.delete('/:checkpointId/flag', validate(validation.id), controller.unflag);

export default router;
