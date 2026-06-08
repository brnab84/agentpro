import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './ai.service.js';

export const qualify = asyncHandler(async (req, res) => {
  const result = await service.qualifyFromText(
    req.tenantId,
    req.params.leadId,
    req.body.conversationText,
  );
  res.json(result);
});

export const rescore = asyncHandler(async (req, res) => {
  res.json(await service.rescore(req.tenantId, req.params.leadId));
});

export const matches = asyncHandler(async (req, res) => {
  res.json(await service.getMatches(req.tenantId, req.params.leadId));
});
