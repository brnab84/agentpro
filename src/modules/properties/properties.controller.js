import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';
import * as service from './properties.service.js';

export const list = asyncHandler(async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  res.json(await service.list(req.tenantId, filter));
});
export const getById = asyncHandler(async (req, res) =>
  res.json(await service.getById(req.tenantId, req.params.id)),
);
export const create = asyncHandler(async (req, res) =>
  res.status(201).json(await service.create(req.tenantId, req.body)),
);
export const update = asyncHandler(async (req, res) =>
  res.json(await service.update(req.tenantId, req.params.id, req.body)),
);
export const remove = asyncHandler(async (req, res) => {
  await service.remove(req.tenantId, req.params.id);
  res.status(204).send();
});

export const importFromUrl = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) throw new AppError('url is required', 400);

  let html = '';
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentPro/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    html = await resp.text();
  } catch {
    throw new AppError('No se pudo acceder a la URL', 422);
  }

  // Strip HTML tags, keep text, limit size
  const text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  // Extract image URLs from HTML
  const imgMatches = [...html.matchAll(/(?:src|data-src)=["']([^"']*(?:jpg|jpeg|png|webp)[^"']*)/gi)];
  const photos = [...new Set(imgMatches.map(m => m[1]).filter(u => u.startsWith('http')))].slice(0, 8);

  const client = getAnthropic();
  const message = await client.messages.create({
    model: env.aiModel,
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Extraé los datos de esta propiedad inmobiliaria del siguiente texto y devolvé SOLO un JSON válido con estos campos (omití los que no encuentres):
{
  "title": "título descriptivo",
  "price": número_sin_puntos_ni_comas,
  "type": "house|apartment|land|commercial",
  "beds": número,
  "baths": número,
  "area": número_en_m2,
  "zone": "barrio o zona",
  "address": "dirección completa",
  "description": "descripción breve"
}

Texto: ${text}`,
    }],
  });

  let extracted = {};
  try {
    const jsonMatch = message.content[0].text.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch { /* ignore parse errors */ }

  res.json({ ...extracted, photos, sourceUrl: url });
});
