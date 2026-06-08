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
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-419,es;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    html = await resp.text();
  } catch {
    throw new AppError('No se pudo acceder a la URL', 422);
  }

  const photoSet = new Set();

  // ── MercadoLibre: use public REST API ────────────────────────────────────────
  const mlMatch = url.match(/mercadolibre\.com[^/]*\/(?:[^/]+-)?([A-Z]{2,3}\d+)(?:[#?]|$)/i)
    || url.match(/\/([A-Z]{2,3}\d{5,})/i);
  if (mlMatch && url.includes('mercadolibre')) {
    try {
      const itemId = mlMatch[1].replace('-', '');
      const apiResp = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (apiResp.ok) {
        const item = await apiResp.json();
        (item.pictures || []).forEach(p => p.url && photoSet.add(p.url.replace('-I.jpg', '-O.jpg')));
        // Also build text from API data for Claude
        const loc = item.seller_address;
        html += ` ${item.title || ''} ${item.price || ''} ${item.currency_id || ''} `
          + `${item.attributes?.map(a => a.name + ':' + a.value_name).join(' ') || ''} `
          + `${loc ? `${loc.neighborhood?.name || ''} ${loc.city?.name || ''} ${loc.state?.name || ''}` : ''}`;
      }
    } catch { /* fall through to HTML parsing */ }
  }

  // ── Next.js __NEXT_DATA__ (Zonaprop, Argenprop, etc.) ───────────────────────
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nd = JSON.parse(nextDataMatch[1]);
      const findImages = (obj, depth = 0) => {
        if (depth > 8 || !obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (typeof val === 'string' && val.startsWith('http') && /\.(jpg|jpeg|png|webp)/i.test(val)) photoSet.add(val);
          else if (key.match(/photo|image|picture|foto|imagen/i) && typeof val === 'string' && val.startsWith('http')) photoSet.add(val);
          else if (Array.isArray(val)) val.forEach(v => findImages(v, depth + 1));
          else if (typeof val === 'object') findImages(val, depth + 1);
        }
      };
      findImages(nd);
    } catch { /* ignore */ }
  }

  // ── og:image / twitter:image meta tags ──────────────────────────────────────
  for (const m of html.matchAll(/(?:og:image|twitter:image)[^>]*content=["']([^"']+)["']/gi)) photoSet.add(m[1]);
  for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*(?:og:image|twitter:image)/gi)) photoSet.add(m[1]);

  // ── JSON-LD structured data ──────────────────────────────────────────────────
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(m[1]);
      const imgs = [obj.image, obj.photo, ...(obj.images || [])].flat().filter(Boolean);
      imgs.forEach(i => typeof i === 'string' ? photoSet.add(i) : i?.url && photoSet.add(i.url));
    } catch { /* ignore */ }
  }

  // ── data-src / lazy loading attributes ──────────────────────────────────────
  for (const m of html.matchAll(/(?:data-src|data-lazy-src|data-original|data-image|data-full-src|src)=["']([^"']{20,})["']/gi)) {
    const u = m[1];
    if (u.startsWith('http') && /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(u)) photoSet.add(u);
  }

  // ── JSON strings anywhere in HTML with image URLs ────────────────────────────
  for (const m of html.matchAll(/"(https?:\/\/[^"]{15,}\.(jpg|jpeg|png|webp)(?:\?[^"]{0,100})?)"/gi)) photoSet.add(m[1]);

  // Strip HTML for text extraction (after photo mining)
  const text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  const skipPatterns = /logo|icon|avatar|sprite|pixel|banner|ad[_\-]|tracking|placeholder|blank|button|flag|star|heart/i;
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
