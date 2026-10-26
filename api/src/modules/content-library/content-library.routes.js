import { Router } from 'express';
import contentLibraryController from './content-library.controller.js';
import contentLibraryValidation from './content-library.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

const requireSpecialist = [auth, authorize('admin', 'specialist')];
const requireAdmin = [auth, authorize('admin')];

// =============================================================================
// Standalone UI Audio Assets Router (/api/v1/ui-audio-assets)
// =============================================================================
export const uiAudioAssetsRouter = Router();

uiAudioAssetsRouter
  .route('/')
  .get(validate(contentLibraryValidation.getUiAudioAssets), contentLibraryController.getUiAudioAssets)
  .post(
    ...requireSpecialist,
    validate(contentLibraryValidation.createUiAudioAsset),
    contentLibraryController.createUiAudioAsset
  );

uiAudioAssetsRouter
  .route('/by-key/:key')
  .get(validate(contentLibraryValidation.getUiAudioAssetByKey), contentLibraryController.getUiAudioAssetByKey);

uiAudioAssetsRouter
  .route('/:id')
  .get(validate(contentLibraryValidation.getUiAudioAssetById), contentLibraryController.getUiAudioAssetById)
  .put(
    ...requireSpecialist,
    validate(contentLibraryValidation.updateUiAudioAsset),
    contentLibraryController.updateUiAudioAsset
  )
  .delete(...requireSpecialist, validate(contentLibraryValidation.deleteUiAudioAsset), contentLibraryController.deleteUiAudioAsset);

// =============================================================================
// Unified Content Library Router (/api/v1/content-library)
// =============================================================================
export const contentLibraryRouter = Router();

// Stats overview (Specialist / Admin)
contentLibraryRouter.get('/stats', ...requireSpecialist, contentLibraryController.getContentLibraryStats);

// Mount resource routers also under unified content-library
contentLibraryRouter.use('/ui-audio-assets', uiAudioAssetsRouter);

export default contentLibraryRouter;
