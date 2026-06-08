import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import * as controller from './users.controller.js';

const router = Router();

router.use(auth, tenantScope);
router.get('/', controller.list);
router.post('/invite', controller.invite);
router.delete('/:id', controller.remove);

export default router;
