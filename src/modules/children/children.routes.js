import express from 'express';
import childrenController from './children.controller.js';
import childrenValidation from './children.validation.js';
import { auth, validate } from '../../middlewares/index.js';

const router = express.Router();

// All children endpoints require authenticated parent
router.use(auth);

router
  .route('/')
  .post(validate(childrenValidation.createChild), childrenController.createChild)
  .get(childrenController.getChildren);

router
  .route('/:id')
  .get(validate(childrenValidation.getChild), childrenController.getChildById)
  .put(validate(childrenValidation.updateChild), childrenController.updateChild)
  .delete(validate(childrenValidation.deleteChild), childrenController.deleteChild);

router
  .route('/:id/usage')
  .get(validate(childrenValidation.getUsage), childrenController.getChildUsage)
  .post(validate(childrenValidation.logUsageSession), childrenController.logUsageSession);

export default router;
