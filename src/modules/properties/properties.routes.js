import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import { validate } from '../../middleware/validate.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { createPropertySchema, updatePropertySchema } from './properties.schema.js';
import * as controller from './properties.controller.js';

const router = Router();

// Public: browser bookmarklet posts the page HTML (from the user's own IP).
// Auth is by per-tenant import key in the query string, not JWT.
router.post('/import-from-html', aiLimiter, controller.importFromHtml);

router.use(auth, tenantScope);

router.get('/', controller.list);
router.get('/import-key', controller.getImportKey);
router.post('/import-key/regenerate', controller.regenerateImportKey);
router.post('/import-url', aiLimiter, controller.importFromUrl);
router.post('/bulk', controller.bulkImport);
router.post('/', validate(createPropertySchema), controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', validate(updatePropertySchema), controller.update);
router.delete('/:id', controller.remove);

export default router;
