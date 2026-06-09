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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-419,es;q=0.9,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

const SKIP_PHOTO = /logo|icon|avatar|sprite|pixel|banner|ad[_\-]|tracking|placeholder|blank|button|flag|star|heart|thumb_up|checkmark|loading|default-user|no-image|empty|favicon|captcha|recaptcha/i;

const parseNum = v => {
  if (v == null) return undefined;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return isNaN(n) ? undefined : n;
};

function harvestPhotos(html) {
  const set = new Set();
  // og:image / twitter:image
  for (const m of html.matchAll(/(?:og:image|twitter:image)[^>]*content=["']([^"']+)["']/gi)) set.add(m[1]);
  for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*(?:og:image|twitter:image)/gi)) set.add(m[1]);
  // JSON-LD
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(m[1]);
      [obj.image, obj.photo, ...(obj.images||[])].flat().filter(Boolean)
        .forEach(i => typeof i === 'string' ? set.add(i) : i?.url && set.add(i.url));
    } catch { /* ignore */ }
  }
  // data-src / lazy
  for (const m of html.matchAll(/(?:data-src|data-lazy-src|data-original|data-full-src|data-image)=["']([^"']{20,})["']/gi)) {
    if (m[1].startsWith('http') && /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(m[1])) set.add(m[1]);
  }
  // src=
  for (const m of html.matchAll(/\bsrc=["']([^"']{20,})["']/gi)) {
    if (m[1].startsWith('http') && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(m[1])) set.add(m[1]);
  }
  // JSON strings
  for (const m of html.matchAll(/"(https?:\/\/[^"]{15,}\.(jpg|jpeg|png|webp)(?:\?[^"]{0,120})?)"/gi)) set.add(m[1]);

  return [...set].filter(u => u.startsWith('http') && !SKIP_PHOTO.test(u)).slice(0, 15);
}

function deepImages(obj, set = new Set(), depth = 0) {
  if (depth > 10 || !obj || typeof obj !== 'object') return;
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      if (val.startsWith('http') && /\.(jpg|jpeg|png|webp)/i.test(val)) set.add(val);
      else if (/photo|image|picture|foto|imagen|url/i.test(key) && val.startsWith('http')) set.add(val);
    } else if (Array.isArray(val)) val.forEach(v => deepImages(v, set, depth + 1));
    else if (typeof val === 'object') deepImages(val, set, depth + 1);
  }
}

/** Parse ML REST API item into structured property */
function parseMlItem(item) {
  const r = {};
  r.title = item.title || '';

  const currMap = { USD:'USD', ARS:'ARS', PEN:'PEN', BRL:'BRL', COP:'COP', MXN:'MXN', CLP:'CLP', UYU:'UYU', PAB:'USD', GTQ:'GTQ', HNL:'HNL', NIO:'NIO', CRC:'CRC' };
  r.currency = currMap[item.currency_id] || item.currency_id || 'USD';
  r.price = item.price || 0;

  const tl = (item.title || '').toLowerCase();
  r.operation = (tl.includes('alquiler') || tl.includes('arriendo') || tl.includes('renta') || item.listing_type_id?.includes('rental')) ? 'rent' : 'sale';
  r.type = tl.includes('departamento') || tl.includes('apartamento') ? 'apartment'
         : tl.includes('terreno') || tl.includes('lote') ? 'land'
         : tl.includes('local') || tl.includes('oficina') ? 'commercial'
         : 'house';

  // Location
  const loc = item.seller_address || item.location || {};
  const parts = [
    loc.street_name && loc.street_number ? `${loc.street_name} ${loc.street_number}` : loc.street_name,
    loc.neighborhood?.name, loc.city?.name, loc.state?.name,
  ].filter(Boolean);
  if (parts.length) r.address = parts.join(', ');
  r.zone = loc.neighborhood?.name || loc.city?.name || '';

  // Build attribute lookup (by id AND by name, both lowercase)
  const attr = {};
  for (const a of (item.attributes || [])) {
    if (a.value_name && a.value_name !== 'No') {
      if (a.id) attr[a.id.toLowerCase()] = a.value_name;
      if (a.name) attr[a.name.toLowerCase()] = a.value_name;
    }
  }

  r.beds     = parseNum(attr['rooms'] || attr['bedrooms'] || attr['dormitorios'] || attr['habitaciones'] || attr['ambientes'] || attr['property_rooms']);
  r.baths    = parseNum(attr['bathrooms'] || attr['bathrooms_quantity'] || attr['baños'] || attr['banos']);
  r.area     = parseNum(attr['covered_area'] || attr['superficie_cubierta'] || attr['floor_space'] || attr['superficie'] || attr['surface_covered'] || attr['covered_surface']);
  r.areaTotal= parseNum(attr['total_area'] || attr['superficie_total'] || attr['land_area'] || attr['total_surface']);
  r.parking  = parseNum(attr['parking_lots'] || attr['cocheras'] || attr['garage'] || attr['covered_parking_lots'] || attr['parking']);
  r.floor    = parseNum(attr['floor'] || attr['piso'] || attr['floor_number'] || attr['floors']);
  r.age      = parseNum(attr['property_age'] || attr['antiguedad'] || attr['antigüedad'] || attr['age_since']);

  // Features
  const kwMap = { piscina:'piscina', pileta:'piscina', gimnasio:'gimnasio', quincho:'quincho', sum:'salón de usos múltiples', laundry:'laundry', sauna:'sauna', spa:'spa', terraza:'terraza', balcon:'balcón', balcón:'balcón', jardín:'jardín', jardin:'jardín', parrilla:'parrilla', seguridad:'seguridad 24hs', vigilancia:'vigilancia' };
  const features = new Set();
  for (const [k, v] of Object.entries(attr)) {
    const txt = `${k} ${v}`.toLowerCase();
    for (const [kw, label] of Object.entries(kwMap)) if (txt.includes(kw)) features.add(label);
    if (v === 'Sí' || v === 'Si' || v === 'Yes') { const clean = k.replace(/_/g,' ').trim(); if (clean.length > 2) features.add(clean); }
  }
  r.features = [...features].slice(0, 10);

  // Photos
  r.photos = [...new Set(
    (item.pictures || []).map(p => p.url ? p.url.replace(/-[A-Z]\.jpg$/i, '-O.jpg') : null).filter(Boolean)
  )].slice(0, 12);

  return r;
}

/** Try to pull structured data from ZonaProp / Argenprop __NEXT_DATA__ */
function parseNextData(nd) {
  const r = {};
  const tryNode = (obj, depth = 0) => {
    if (depth > 8 || !obj || typeof obj !== 'object') return;
    if (obj.operations?.[0]) {
      const op = obj.operations[0];
      if (op.operationType?.id === 'Rent' || op.operationType?.name?.toLowerCase().includes('alquiler')) r.operation = 'rent';
      else if (!r.operation) r.operation = 'sale';
      if (!r.price && op.prices?.[0]) { r.price = op.prices[0].price; r.currency = op.prices[0].currency || 'USD'; }
    }
    if (!r.address && (obj.addressFormatted || obj.address)) r.address = obj.addressFormatted || obj.address;
    if (!r.address && obj.location?.full) r.address = obj.location.full;
    if (!r.zone && obj.location?.divisions?.length) r.zone = obj.location.divisions.slice(-1)[0]?.prettyName || '';
    if (obj.mainFeatures?.length) {
      for (const f of obj.mainFeatures) {
        const k = (f.icon || f.key || '').toLowerCase();
        const v = f.value || f.label || '';
        if ((k.includes('room') || k.includes('dormit')) && !r.beds) r.beds = parseNum(v);
        if (k.includes('bath') && !r.baths) r.baths = parseNum(v);
        if ((k.includes('superf') || k.includes('cubierta')) && !r.area) r.area = parseNum(v);
        if (k.includes('total') && !r.areaTotal) r.areaTotal = parseNum(v);
        if ((k.includes('garag') || k.includes('coche')) && !r.parking) r.parking = parseNum(v);
        if ((k.includes('piso') || k.includes('floor')) && r.floor == null) r.floor = parseNum(v);
        if ((k.includes('antig') || k.includes('age')) && r.age == null) r.age = parseNum(v);
      }
    }
    if (!r.title && typeof obj.title === 'string' && obj.title.length > 5) r.title = obj.title;
    if (!r.description && typeof obj.description === 'string' && obj.description.length > 20) r.description = obj.description.slice(0, 600);
    if (!r.features?.length) {
      const amenArr = obj.amenities || obj.allFeatures || obj.tags || [];
      if (amenArr.length) r.features = amenArr.map(a => a.name || a.label || a).filter(Boolean).slice(0, 10);
    }
    for (const v of Object.values(obj)) if (v && typeof v === 'object') tryNode(v, depth + 1);
  };
  tryNode(nd);
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main import endpoint
// ─────────────────────────────────────────────────────────────────────────────
export const importFromUrl = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) throw new AppError('url is required', 400);

  // 1. Fetch HTML
  let html = '';
  let fetchOk = false;
  try {
    const resp = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
    // Accept any 2xx or 3xx; some portals return 403 but still serve content
    html = await resp.text();
    fetchOk = resp.ok;
    if (!fetchOk) console.warn(`import-url: HTTP ${resp.status} for ${url}`);
  } catch (err) {
    throw new AppError(`No se pudo acceder a la URL: ${err.message}`, 422);
  }

  // If we got a very short response it's likely a block page
  if (html.length < 500) {
    throw new AppError('El portal bloqueó el acceso automático. Intentá copiar los datos manualmente.', 422);
  }

  const photoSet = new Set();
  let preExtracted = {}; // filled by site-specific parsers

  // ── 2. MercadoLibre: detect item ID → call REST API ───────────────────────
  const isMl = /mercadolibre\.|meli\.com/i.test(url);
  if (isMl) {
    // ML item IDs: MLA-123456789, MLB123456, MLM-12345678 etc.
    const mlIdRe = /\b(M[A-Z]{1,2}[-]?\d{6,12})\b/i;
    const mlMatch = url.match(mlIdRe) || html.match(/"item_id"\s*:\s*"([A-Z]{2,3}\d{6,12})"/i)
      || html.match(/"id"\s*:\s*"([A-Z]{2,3}\d{6,12})"/i);

    if (mlMatch) {
      const rawId = mlMatch[1].replace(/-/g, '').toUpperCase();
      console.log('ML item ID detected:', rawId);
      try {
        const [itemResp, descResp] = await Promise.all([
          fetch(`https://api.mercadolibre.com/items/${rawId}`, {
            headers: { 'User-Agent': FETCH_HEADERS['User-Agent'] },
            signal: AbortSignal.timeout(12000),
          }),
          fetch(`https://api.mercadolibre.com/items/${rawId}/description`, {
            headers: { 'User-Agent': FETCH_HEADERS['User-Agent'] },
            signal: AbortSignal.timeout(8000),
          }).catch(() => null),
        ]);

        if (itemResp.ok) {
          const item = await itemResp.json();
          preExtracted = parseMlItem(item);
          preExtracted.photos.forEach(p => photoSet.add(p));
          // Augment html with attribute text for Claude fallback
          html += ' ' + (item.attributes || []).map(a => `${a.name}:${a.value_name}`).join(' ');

          if (descResp?.ok) {
            const dj = await descResp.json();
            if (dj.plain_text) preExtracted.description = dj.plain_text.slice(0, 600);
          }
          console.log('ML API success:', preExtracted.title);
        } else {
          console.warn('ML API returned', (await itemResp.json().catch(() => ({}))).message || itemResp.status);
        }
      } catch (err) {
        console.warn('ML API error:', err.message);
      }
    } else {
      // No item ID — this is a listing/search page, not a property detail
      console.warn('ML: no item ID found in URL or HTML — is this a search page?');
      // Try __NEXT_DATA__ anyway
    }
  }

  // ── 3. __NEXT_DATA__ (ZonaProp, Argenprop, Encuentra24, etc.) ────────────
  const ndMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ndMatch) {
    try {
      const nd = JSON.parse(ndMatch[1]);
      const fromNext = parseNextData(nd);
      // Merge — don't overwrite data already obtained from ML API
      for (const [k, v] of Object.entries(fromNext)) {
        if (!preExtracted[k] && v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) {
          preExtracted[k] = v;
        }
      }
      deepImages(nd, photoSet);
    } catch (e) { console.warn('__NEXT_DATA__ parse error:', e.message); }
  }

  // ── 4. Harvest photos from raw HTML ──────────────────────────────────────
  harvestPhotos(html).forEach(u => photoSet.add(u));

  // ── 5. Strip HTML for Claude ──────────────────────────────────────────────
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);

  // ── 6. Claude extraction ──────────────────────────────────────────────────
  let aiExtracted = {};
  try {
    const client = getAnthropic();
    const alreadyHave = Object.entries(preExtracted)
      .filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');

    const hint = alreadyHave ? `\n\nYa extraído por API (no repetir si son correctos): ${alreadyHave}\n` : '';

    const msg = await client.messages.create({
      model: env.aiModel,
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: `${hint}
Extraé todos los datos de esta propiedad inmobiliaria del texto y devolvé SOLO un JSON válido.
Campos (omití los que no puedas determinar):
{
  "title": "título descriptivo",
  "price": número,
  "currency": "USD|ARS|PEN|COP|MXN|CLP|BRL",
  "operation": "sale|rent",
  "type": "house|apartment|land|commercial|office|warehouse",
  "beds": número,
  "baths": número,
  "area": número_m2_cubiertos,
  "areaTotal": número_m2_total,
  "parking": número,
  "floor": número,
  "age": años,
  "zone": "barrio/zona",
  "address": "dirección completa",
  "features": ["amenidad1","amenidad2"],
  "description": "descripción de 2-3 oraciones"
}
Texto: ${text}`,
      }],
    });

    const jm = msg.content[0].text.match(/\{[\s\S]*\}/);
    if (jm) aiExtracted = JSON.parse(jm[0]);
  } catch (err) {
    console.warn('Claude extraction failed:', err.message);
  }

  // ── 7. Merge: ML/Next API wins, Claude fills gaps ─────────────────────────
  const merged = { ...aiExtracted };
  for (const [k, v] of Object.entries(preExtracted)) {
    if (k === 'photos') continue;
    if (v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) merged[k] = v;
  }

  // ── 8. Final photos ───────────────────────────────────────────────────────
  const aiPhotos = (aiExtracted.photos || []).filter(u => typeof u === 'string' && u.startsWith('http'));
  const allPhotos = [...new Set([...(preExtracted.photos || []), ...photoSet, ...aiPhotos])]
    .filter(u => u.startsWith('http') && !SKIP_PHOTO.test(u))
    .slice(0, 12);

  delete merged.photos;

  const fieldsFilled = Object.values(merged).filter(v => v != null && v !== '' && !(Array.isArray(v) && !v.length)).length;
  console.log(`import-url: ${fieldsFilled} fields extracted for ${url}`);

  res.json({ ...merged, photos: allPhotos, sourceUrl: url });
});
