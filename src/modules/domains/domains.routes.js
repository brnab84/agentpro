import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Domain } from '../../models/Domain.js';
import { AppError } from '../../utils/AppError.js';

const router = Router();
router.use(auth, tenantScope);

router.get('/', asyncHandler(async (req, res) => {
  res.json(await Domain.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).lean());
}));

router.post('/', asyncHandler(async (req, res) => {
  const { domain } = req.body;
  if (!domain) throw new AppError('El dominio es requerido', 400);
  const doc = await Domain.create({
    tenantId: req.tenantId,
    domain: domain.toLowerCase().trim(),
    dkimKey: `v=DKIM1; k=rsa; p=${Math.random().toString(36).slice(2,30)}`,
    spfRecord: `v=spf1 include:agentpro.app ~all`,
  });
  res.status(201).json(doc);
}));

router.post('/:id/verify', asyncHandler(async (req, res) => {
  // In production this would do real DNS lookup; here we simulate
  const doc = await Domain.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { status: 'verified', verified: true },
    { new: true },
  );
  if (!doc) throw new AppError('Dominio no encontrado', 404);
  res.json(doc);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const doc = await Domain.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!doc) throw new AppError('Dominio no encontrado', 404);
  res.json({ ok: true });
}));

export default router;
