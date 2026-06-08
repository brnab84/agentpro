import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import { validate } from '../../middleware/validate.js';
import { createAppointmentSchema, updateAppointmentSchema } from './appointments.schema.js';
import * as controller from './appointments.controller.js';

const router = Router();
router.use(auth, tenantScope);

router.get('/', controller.list);
router.post('/', validate(createAppointmentSchema), controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', validate(updateAppointmentSchema), controller.update);
router.delete('/:id', controller.remove);

export default router;
