import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import { validate } from '../../middleware/validate.js';
import { createPropertySchema, updatePropertySchema } from './properties.schema.js';
import * as controller from './properties.controller.js';

const router = Router();
router.use(auth, tenantScope);

router.get('/', controller.list);
router.post('/import-url', controller.importFromUrl);
router.post('/', validate(createPropertySchema), controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', validate(updatePropertySchema), controller.update);
router.delete('/:id', controller.remove);

export default router;
