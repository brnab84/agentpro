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

  // Extract image URLs — multiple strategies
  const photoSet = new Set();

  // 1. og:image and twitter:image meta tags (most reliable)
  for (const m of html.matchAll(/(?:og:image|twitter:image)[^>]*content=["']([^"']+)["']/gi)) photoSet.add(m[1]);
  for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*(?:og:image|twitter:image)/gi)) photoSet.add(m[1]);

  // 2. JSON-LD structured data
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(m[1]);
      const imgs = [obj.image, obj.photo, ...(obj.images || [])].flat().filter(Boolean);
      imgs.forEach(i => typeof i === 'string' ? photoSet.add(i) : i?.url && photoSet.add(i.url));
    } catch { /* ignore */ }
  }

  // 3. src / data-src / data-lazy-src / data-original with image extensions or CDN paths
  for (const m of html.matchAll(/(?:data-src|data-lazy-src|data-original|data-image|src)=["']([^"']{20,})["']/gi)) {
    const u = m[1];
    if (u.startsWith('http') && /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(u)) photoSet.add(u);
  }

  // 4. JSON strings inside script tags with image URLs
  for (const m of html.matchAll(/"(https?:\/\/[^"]{10,}\.(jpg|jpeg|png|webp)(?:\?[^"]*)?)"/gi)) photoSet.add(m[1]);

  // Filter out icons/logos/tracking pixels (common patterns)
  const skipPatterns = /logo|icon|avatar|sprite|pixel|banner|ad[_-]|tracking|placeholder|blank/i;
  const photos = [...photoSet]
    .filter(u => u.startsWith('http') && !skipPatterns.test(u))
    .slice(0, 10);

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
  "description": "descripción breve de 2-3 oraciones",
  "photos": ["url1","url2"]
}

El campo "photos" solo si encontrás URLs completas de imágenes (http...) en el texto.

Texto: ${text}`,
    }],
  });

  let extracted = {};
  try {
    const jsonMatch = message.content[0].text.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch { /* ignore parse errors */ }

  // Merge photos: regex-extracted + AI-extracted, deduplicated
  const aiPhotos = (extracted.photos || []).filter(u => typeof u === 'string' && u.startsWith('http'));
  const allPhotos = [...new Set([...photos, ...aiPhotos])].slice(0, 10);
  delete extracted.photos;

  res.json({ ...extracted, photos: allPhotos, sourceUrl: url });
});
