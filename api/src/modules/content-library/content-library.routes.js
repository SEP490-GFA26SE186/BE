import { Router } from 'express';
import contentLibraryController from './content-library.controller.js';
import contentLibraryValidation from './content-library.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

const requireModerator = [auth, authorize('admin', 'moderator')];
const requireAdmin = [auth, authorize('admin')];

// =============================================================================
// Standalone Backgrounds Router (/api/v1/backgrounds)
// =============================================================================
export const backgroundsRouter = Router();

backgroundsRouter
  .route('/')
  .get(validate(contentLibraryValidation.getBackgrounds), contentLibraryController.getBackgrounds)
  .post(
    ...requireModerator,
    validate(contentLibraryValidation.createBackground),
    contentLibraryController.createBackground
  );

backgroundsRouter
  .route('/:id')
  .get(validate(contentLibraryValidation.getBackgroundById), contentLibraryController.getBackgroundById)
  .put(
    ...requireModerator,
    validate(contentLibraryValidation.updateBackground),
    contentLibraryController.updateBackground
  )
  .delete(...requireModerator, validate(contentLibraryValidation.deleteBackground), contentLibraryController.deleteBackground);

// =============================================================================
// Standalone UI Audio Assets Router (/api/v1/ui-audio-assets)
// =============================================================================
export const uiAudioAssetsRouter = Router();

uiAudioAssetsRouter
  .route('/')
  .get(validate(contentLibraryValidation.getUiAudioAssets), contentLibraryController.getUiAudioAssets)
  .post(
    ...requireModerator,
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
    ...requireModerator,
    validate(contentLibraryValidation.updateUiAudioAsset),
    contentLibraryController.updateUiAudioAsset
  )
  .delete(...requireModerator, validate(contentLibraryValidation.deleteUiAudioAsset), contentLibraryController.deleteUiAudioAsset);

// =============================================================================
// Standalone Checklist Items Router (/api/v1/checklist-items)
// =============================================================================
export const checklistItemsRouter = Router();

checklistItemsRouter
  .route('/')
  .get(validate(contentLibraryValidation.getChecklistItems), contentLibraryController.getChecklistItems)
  .post(
    ...requireModerator,
    validate(contentLibraryValidation.createChecklistItem),
    contentLibraryController.createChecklistItem
  );

checklistItemsRouter
  .route('/:id')
  .get(validate(contentLibraryValidation.getChecklistItemById), contentLibraryController.getChecklistItemById)
  .put(
    ...requireModerator,
    validate(contentLibraryValidation.updateChecklistItem),
    contentLibraryController.updateChecklistItem
  )
  .delete(...requireModerator, validate(contentLibraryValidation.deleteChecklistItem), contentLibraryController.deleteChecklistItem);

// =============================================================================
// Unified Content Library Router (/api/v1/content-library)
// =============================================================================
export const contentLibraryRouter = Router();

// Stats overview (Moderator / Admin)
contentLibraryRouter.get('/stats', ...requireModerator, contentLibraryController.getContentLibraryStats);

// Blocked Keywords Bulk & Update (Moderator / Admin)
contentLibraryRouter.post(
  '/keywords/bulk',
  ...requireModerator,
  validate(contentLibraryValidation.bulkImportKeywords),
  contentLibraryController.bulkImportKeywords
);
contentLibraryRouter.put(
  '/keywords/:id',
  ...requireModerator,
  validate(contentLibraryValidation.updateKeyword),
  contentLibraryController.updateKeyword
);

// Mount resource routers also under unified content-library
contentLibraryRouter.use('/backgrounds', backgroundsRouter);
contentLibraryRouter.use('/ui-audio-assets', uiAudioAssetsRouter);
contentLibraryRouter.use('/checklist-items', checklistItemsRouter);

export default contentLibraryRouter;
