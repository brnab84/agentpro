import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import * as controller from './wa-templates.controller.js';

const router = Router();
router.use(auth, tenantScope);

router.get('/',          controller.list);
router.post('/',         controller.create);
router.post('/sync',     controller.syncFromMeta);
router.get('/:id',       controller.getById);
router.patch('/:id',     controller.update);
router.delete('/:id',    controller.remove);

export default router;
