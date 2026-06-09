import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import * as controller from './email-accounts.controller.js';

const router = Router();
router.use(auth, tenantScope);

router.get('/',              controller.list);
router.post('/',             controller.create);
router.get('/:id',           controller.getById);
router.patch('/:id',         controller.update);
router.delete('/:id',        controller.remove);
router.post('/:id/test',     controller.testConnection);
router.post('/:id/send-test',controller.sendTest);

export default router;
