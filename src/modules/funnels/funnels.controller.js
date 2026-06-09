import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import * as service from './funnels.service.js';
import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.tenantId));
});

export const getById = asyncHandler(async (req, res) => {
  res.json(await service.getById(req.tenantId, req.params.id));
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.tenantId, req.body));
});

export const update = asyncHandler(async (req, res) => {
  res.json(await service.update(req.tenantId, req.params.id, req.body));
});

export const remove = asyncHandler(async (req, res) => {
  if (req.user.role !== 'owner') throw new AppError('Only owners can delete funnels', 403);
  await service.remove(req.tenantId, req.params.id);
  res.status(204).send();
});

export const getStats = asyncHandler(async (req, res) => {
  res.json(await service.getStats(req.tenantId, req.params.id));
});

export const getLeads = asyncHandler(async (req, res) => {
  res.json(await service.getLeads(req.tenantId, req.params.id));
});

// ── Context files (PDF upload via base64 JSON) ────────────────────────────────

export const uploadContextFile = asyncHandler(async (req, res) => {
  const { name, base64, size } = req.body;
  if (!name || !base64) throw new AppError('name and base64 are required', 400);
  if (size > 5 * 1024 * 1024) throw new AppError('File too large (max 5 MB)', 400);

  const funnel = await service.getById(req.tenantId, req.params.id);
  if ((funnel.contextFiles?.length || 0) >= 4) throw new AppError('Máximo 4 archivos por funnel', 400);

  // Extract text from PDF using Claude
  let extractedText = '';
  try {
    const client = getAnthropic();
    const extraction = await client.messages.create({
      model: env.aiModel,
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          { type: 'text', text: 'Extraé todo el texto de este documento tal como aparece, sin resumir ni modificar el contenido.' },
        ],
      }],
    });
    extractedText = extraction.content[0].text;
  } catch (err) {
    // If model doesn't support PDFs, store a note
    extractedText = `[No se pudo extraer texto de ${name}: ${err.message}]`;
  }

  const updated = await service.addContextFile(req.tenantId, req.params.id, {
    name,
    text: extractedText,
    size: size || 0,
  });

  res.status(201).json(updated.contextFiles.at(-1));
});

export const deleteContextFile = asyncHandler(async (req, res) => {
  await service.removeContextFile(req.tenantId, req.params.id, req.params.fileId);
  res.status(204).send();
});
