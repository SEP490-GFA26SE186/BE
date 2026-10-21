import { Router } from 'express';
import { auth, authorize, validate } from '../../middlewares/index.js';
import controller from './pedagogy-settings.controller.js';
import validation from './pedagogy-settings.validation.js';

// Tham so su pham do Specialist dat (phu huynh nhan tham so ben trong bao cao EQ, khong goi route nay).
const router = Router();
router.use(auth, authorize('specialist', 'admin'));

router.get('/report-settings', controller.getReportSettings);
router.put('/report-settings', validate(validation.updateReportSettings), controller.updateReportSettings);

export default router;
