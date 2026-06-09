import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import { validate } from '../../middleware/validate.js';
import { qualifySchema } from './ai.schema.js';
import * as controller from './ai.controller.js';

const router = Router();
router.use(auth, tenantScope);

// Sugerencias IA para el dashboard
router.get('/suggestions', controller.suggestions);
// Calificación IA desde texto de conversación
router.post('/leads/:leadId/qualify', validate(qualifySchema), controller.qualify);
// Recalcular score + matches + next-action
router.post('/leads/:leadId/rescore', controller.rescore);
// Obtener propiedades match para un lead
router.get('/leads/:leadId/matches', controller.matches);

export default router;
