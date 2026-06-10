import { Router } from 'express';
import { auth }         from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/admin.js';
import * as controller  from './admin.controller.js';

const router = Router();

// All admin routes require a valid token AND super-admin authorization.
router.use(auth, requireAdmin);

router.get  ('/overview',     controller.getOverview);
router.get  ('/tenants',      controller.listTenants);
router.patch('/tenants/:id',  controller.updateTenant);

export default router;
