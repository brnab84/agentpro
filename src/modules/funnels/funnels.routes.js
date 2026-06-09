import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import * as controller from './funnels.controller.js';

const router = Router();
router.use(auth, tenantScope);

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.get('/:id/stats', controller.getStats);
router.get('/:id/leads', controller.getLeads);
router.post('/:id/context-files', controller.uploadContextFile);
router.delete('/:id/context-files/:fileId', controller.deleteContextFile);

export default router;
