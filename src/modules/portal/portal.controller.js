import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './portal.service.js';
import * as assistant from './portal-assistant.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public endpoints — no authentication required
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/portal/:slug — listing + portal info */
export const getListing = asyncHandler(async (req, res) => {
  const result = await service.getPortalListing(req.params.slug, req.query);
  res.json(result);
});

/** GET /api/portal/:slug/property/:id — single property */
export const getProperty = asyncHandler(async (req, res) => {
  const result = await service.getPropertyDetail(req.params.slug, req.params.id);
  res.json(result);
});

/** POST /api/portal/:slug/contact — create lead from contact form */
export const submitContact = asyncHandler(async (req, res) => {
  const lead = await service.createPortalLead(req.params.slug, req.body);
  res.status(201).json({ ok: true, leadId: lead._id });
});

/** POST /api/portal/:slug/assistant — per-portal AI assistant (captures leads) */
export const assistantAsk = asyncHandler(async (req, res) => {
  res.json(await assistant.ask(req.params.slug, req.body?.messages));
});

// ─────────────────────────────────────────────────────────────────────────────
// CRM endpoints — authenticated
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/portal-config — get current portal settings */
export const getConfig = asyncHandler(async (req, res) => {
  res.json(await service.getPortalConfig(req.tenantId));
});

/** PUT /api/portal-config — save portal settings */
export const saveConfig = asyncHandler(async (req, res) => {
  res.json(await service.savePortalConfig(req.tenantId, req.body));
});

/** PATCH /api/portal-config/properties/:id/publish — toggle publish */
export const togglePublish = asyncHandler(async (req, res) => {
  const result = await service.togglePropertyPublished(
    req.tenantId,
    req.params.id,
    req.body.published,
  );
  res.json(result);
});
