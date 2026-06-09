import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import { validate } from '../../middleware/validate.js';
import { createLeadSchema, updateLeadSchema } from './leads.schema.js';
import * as controller from './leads.controller.js';

const router = Router();
router.use(auth, tenantScope);

router.get('/', controller.list);
router.post('/import', controller.importLeads);
router.post('/', validate(createLeadSchema), controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', validate(updateLeadSchema), controller.update);
router.delete('/:id', controller.remove);

export default router;
