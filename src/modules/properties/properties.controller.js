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
};

const SKIP_PHOTO_PATTERNS = /logo|icon|avatar|sprite|pixel|banner|ad[_\-]|tracking|placeholder|blank|button|flag|star|heart|thumb_up|checkmark|loading|default-user|no-image|empty|favicon/i;

/** Collect images from any HTML, JSON-LD, og:image, __NEXT_DATA__, data-src */
function harvestPhotos(html) {
  const set = new Set();

  // og:image / twitter:image
  for (const m of html.matchAll(/(?:og:image|twitter:image)[^>]*content=["']([^"']+)["']/gi)) set.add(m[1]);
  for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*(?:og:image|twitter:image)/gi)) set.add(m[1]);

  // JSON-LD
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(m[1]);
      const imgs = [obj.image, obj.photo, ...(obj.images || [])].flat().filter(Boolean);
      imgs.forEach(i => typeof i === 'string' ? set.add(i) : i?.url && set.add(i.url));
    } catch { /* ignore */ }
  }

  // data-src / lazy
  for (const m of html.matchAll(/(?:data-src|data-lazy-src|data-original|data-full-src|data-image)=["']([^"']{20,})["']/gi)) {
    const u = m[1];
    if (u.startsWith('http') && /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(u)) set.add(u);
  }

  // src= images
  for (const m of html.matchAll(/\bsrc=["']([^"']{20,})["']/gi)) {
    const u = m[1];
    if (u.startsWith('http') && /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(u)) set.add(u);
  }

  // JSON strings in page
  for (const m of html.matchAll(/"(https?:\/\/[^"]{15,}\.(jpg|jpeg|png|webp|avif)(?:\?[^"]{0,120})?)"/gi)) set.add(m[1]);

  return [...set]
    .filter(u => u.startsWith('http') && !SKIP_PHOTO_PATTERNS.test(u))
    .slice(0, 15);
}

/** Recursively walk an object and collect string image URLs */
function deepFindImages(obj, set = new Set(), depth = 0) {
  if (depth > 10 || !obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      if (val.startsWith('http') && /\.(jpg|jpeg|png|webp)/i.test(val)) set.add(val);
      else if (key.match(/photo|image|picture|foto|imagen|url/i) && val.startsWith('http')) set.add(val);
    } else if (Array.isArray(val)) val.forEach(v => deepFindImages(v, set, depth + 1));
    else if (typeof val === 'object') deepFindImages(val, set, depth + 1);
  }
}

/** Parse MercadoLibre item API response into structured property data */
function parseMercadoLibreItem(item) {
  const result = {};

  result.title = item.title || '';
  result.price = item.price || 0;

  // Currency
  const currencyMap = { USD: 'USD', ARS: 'ARS', PEN: 'PEN', BRL: 'BRL', COP: 'COP', MXN: 'MXN', CLP: 'CLP', UYU: 'UYU' };
  result.currency = currencyMap[item.currency_id] || item.currency_id || 'USD';

  // Operation: sale vs rent
  if (item.category_id?.toLowerCase().includes('alquiler') || item.title?.toLowerCase().includes('alquiler') || item.title?.toLowerCase().includes('arriendo')) {
    result.operation = 'rent';
  } else {
    result.operation = 'sale';
  }

  // Type
  const titleLow = (item.title || '').toLowerCase();
  if (titleLow.includes('departamento') || titleLow.includes('apartamento') || titleLow.includes('piso')) result.type = 'apartment';
  else if (titleLow.includes('terreno') || titleLow.includes('lote')) result.type = 'land';
  else if (titleLow.includes('local') || titleLow.includes('oficina') || titleLow.includes('comercial')) result.type = 'commercial';
  else result.type = 'house';

  // Address / location
  const loc = item.seller_address || item.location || {};
  const parts = [
    loc.street_name && loc.street_number ? `${loc.street_name} ${loc.street_number}` : loc.street_name,
    loc.neighborhood?.name,
    loc.city?.name,
    loc.state?.name,
    loc.country?.name,
  ].filter(Boolean);
  if (parts.length) result.address = parts.join(', ');
  result.zone = loc.neighborhood?.name || loc.city?.name || '';

  // Attributes
  const attrMap = {};
  for (const a of (item.attributes || [])) {
    if (a.id && a.value_name) attrMap[a.id.toLowerCase()] = a.value_name;
    if (a.name && a.value_name) attrMap[a.name.toLowerCase()] = a.value_name;
  }

  const parseNum = v => { const n = parseFloat(String(v).replace(/[^\d.]/g, '')); return isNaN(n) ? undefined : n; };

  result.beds    = parseNum(attrMap['rooms'] || attrMap['bedrooms'] || attrMap['dormitorios'] || attrMap['habitaciones'] || attrMap['ambientes']);
  result.baths   = parseNum(attrMap['bathrooms'] || attrMap['bathrooms_quantity'] || attrMap['baños'] || attrMap['banos']);
  result.area    = parseNum(attrMap['covered_area'] || attrMap['superficie_cubierta'] || attrMap['floor_space'] || attrMap['superficie'] || attrMap['surface_covered']);
  result.areaTotal = parseNum(attrMap['total_area'] || attrMap['superficie_total'] || attrMap['land_area']);
  result.parking = parseNum(attrMap['parking_lots'] || attrMap['cocheras'] || attrMap['garage'] || attrMap['covered_parking_lots']);
  result.floor   = parseNum(attrMap['floor'] || attrMap['piso'] || attrMap['floor_number']);
  result.age     = parseNum(attrMap['property_age'] || attrMap['antiguedad'] || attrMap['antigüedad'] || attrMap['age']);

  // Features from attributes
  const featureKeywords = ['piscina', 'pileta', 'gimnasio', 'quincho', 'seguridad', 'vigilancia', 'amenidades', 'laundry', 'salon', 'sauna', 'spa', 'terraza', 'balcon', 'balcón', 'jardín', 'jardin', 'parrilla', 'sum'];
  const features = [];
  for (const [k, v] of Object.entries(attrMap)) {
    const combined = `${k} ${v}`.toLowerCase();
    for (const kw of featureKeywords) {
      if (combined.includes(kw) && !features.includes(kw)) features.push(kw);
    }
    if (v === 'Sí' || v === 'Si' || v === 'Yes' || v === 'true') {
      const clean = k.replace(/_/g, ' ').trim().toLowerCase();
      if (clean && !features.includes(clean)) features.push(clean);
    }
  }
  result.features = [...new Set(features)].slice(0, 10);

  // Description from item
  if (item.descriptions?.length) {
    // full descriptions fetched separately — skip here, AI handles text
  }

  // Photos
  const photos = [];
  for (const p of (item.pictures || [])) {
    if (p.url) photos.push(p.url.replace(/-[A-Z]\.jpg$/i, '-O.jpg'));
  }
  result.photos = [...new Set(photos)].slice(0, 12);

  return result;
}

/** Try to parse ZonaProp / Argenprop / similar __NEXT_DATA__ JSON for property data */
function parseNextData(ndObj) {
  const result = {};
  // Walk the object looking for property-like nodes
  const tryExtract = (obj, depth = 0) => {
    if (depth > 6 || !obj || typeof obj !== 'object') return;
    // ZonaProp uses realEstate.postingData or similar
    if (obj.mainCategory) result.type = obj.mainCategory;
    if (obj.operations) {
      const op = obj.operations[0];
      if (op?.operationType?.id === 'Rent' || op?.operationType?.name?.toLowerCase().includes('alquiler')) result.operation = 'rent';
      else result.operation = 'sale';
      if (op?.prices?.[0]) {
        result.price    = op.prices[0].price;
        result.currency = op.prices[0].currency || 'USD';
      }
    }
    if (obj.addressFormatted || obj.address) result.address = obj.addressFormatted || obj.address;
    if (obj.location?.full) result.address = obj.location.full;
    if (obj.location?.divisions) {
      result.zone = (obj.location.divisions || []).slice(-1)[0]?.prettyName || result.zone;
    }
    if (obj.mainFeatures) {
      for (const f of (obj.mainFeatures || [])) {
        const k = (f.icon || f.key || '').toLowerCase();
        const v = f.value || f.label;
        if (k.includes('room') || k.includes('dormit') || k.includes('habitac')) result.beds = parseFloat(v) || result.beds;
        if (k.includes('bath') || k.includes('baño')) result.baths = parseFloat(v) || result.baths;
        if (k.includes('area') || k.includes('superf') || k.includes('cubierta')) result.area = parseFloat(v) || result.area;
        if (k.includes('total')) result.areaTotal = parseFloat(v) || result.areaTotal;
        if (k.includes('garag') || k.includes('coche')) result.parking = parseFloat(v) || result.parking;
        if (k.includes('piso') || k.includes('floor')) result.floor = parseFloat(v) || result.floor;
        if (k.includes('antig') || k.includes('age')) result.age = parseFloat(v) || result.age;
      }
    }
    if (typeof obj.title === 'string' && obj.title.length > 5 && !result.title) result.title = obj.title;
    if (typeof obj.description === 'string' && obj.description.length > 20 && !result.description) result.description = obj.description.slice(0, 600);
    if (Array.isArray(obj.amenities)) result.features = obj.amenities.map(a => a.name || a).filter(Boolean).slice(0, 10);
    if (Array.isArray(obj.allFeatures)) result.features = obj.allFeatures.map(a => a.label || a.name || a).filter(Boolean).slice(0, 10);
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') tryExtract(v, depth + 1);
    }
  };
  tryExtract(ndObj);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main import controller
// ─────────────────────────────────────────────────────────────────────────────
export const importFromUrl = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) throw new AppError('url is required', 400);

  let html = '';
  try {
    const resp = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(18000),
      redirect: 'follow',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    html = await resp.text();
  } catch (err) {
    throw new AppError(`No se pudo acceder a la URL: ${err.message}`, 422);
  }

  let preExtracted = {};
  const photoSet = new Set();

  // ── 1. MercadoLibre REST API ──────────────────────────────────────────────
  // ML item ID can be MLA-XXXXXXXX or MLA-XXXXXXXX inside the URL path
  const mlIdMatch = url.match(/\b(M[A-Z]{1,2}[-_]?\d{6,12})\b/i)
    || url.match(/\/([A-Z]{2,3}\d{6,12})(?:[#?_\-]|$)/i);

  if (mlIdMatch && /mercadolibre/i.test(url)) {
    try {
      const rawId = mlIdMatch[1].replace('-', '').replace('_', '').toUpperCase();
      // Try items API
      const itemResp = await fetch(`https://api.mercadolibre.com/items/${rawId}`, {
        headers: { 'User-Agent': FETCH_HEADERS['User-Agent'] },
        signal: AbortSignal.timeout(10000),
      });
      if (itemResp.ok) {
        const item = await itemResp.json();
        preExtracted = parseMercadoLibreItem(item);
        preExtracted.photos.forEach(p => photoSet.add(p));

        // Also try to get full description
        try {
          const descResp = await fetch(`https://api.mercadolibre.com/items/${rawId}/description`, { signal: AbortSignal.timeout(5000) });
          if (descResp.ok) {
            const descJson = await descResp.json();
            if (descJson.plain_text) preExtracted.description = descJson.plain_text.slice(0, 600);
          }
        } catch { /* no description */ }
      }

      // Augment with text built from API attributes for Claude
      const loc = /* already extracted */ '';
      html += ` ${item?.title || ''} ${item?.price || ''} ${item?.currency_id || ''} `
        + (item?.attributes || []).map(a => `${a.name}:${a.value_name}`).join(' ');
    } catch (err) {
      console.warn('ML API failed:', err.message);
    }
  }

  // ── 2. __NEXT_DATA__ (ZonaProp, Argenprop, etc.) ─────────────────────────
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nd = JSON.parse(nextDataMatch[1]);
      const fromNext = parseNextData(nd);
      // Merge — don't overwrite ML data
      for (const [k, v] of Object.entries(fromNext)) {
        if (!preExtracted[k] && v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)) {
          preExtracted[k] = v;
        }
      }
      // Also harvest images from __NEXT_DATA__
      deepFindImages(nd, photoSet);
    } catch { /* ignore */ }
  }

  // ── 3. Harvest photos from raw HTML ──────────────────────────────────────
  harvestPhotos(html).forEach(u => photoSet.add(u));

  // ── 4. Strip HTML for Claude ──────────────────────────────────────────────
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000);

  // ── 5. Claude extraction ──────────────────────────────────────────────────
  let aiExtracted = {};
  try {
    const client = getAnthropic();
    const contextHint = Object.keys(preExtracted).length
      ? `Datos ya extraídos (no repetir si son correctos): ${JSON.stringify(preExtracted)}\n\n`
      : '';

    const message = await client.messages.create({
      model: env.aiModel,
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: `${contextHint}Extraé los datos de esta propiedad inmobiliaria del texto y devolvé SOLO un JSON válido.
Campos a extraer (omití los que no encuentres):
{
  "title": "título descriptivo de la propiedad",
  "price": número sin puntos ni comas,
  "currency": "USD|ARS|PEN|COP|MXN|CLP|UYU|BRL",
  "operation": "sale|rent",
  "type": "house|apartment|land|commercial|office|warehouse",
  "beds": número de dormitorios,
  "baths": número de baños,
  "area": número en m2 (cubiertos),
  "areaTotal": número en m2 (total o terreno),
  "parking": número de cocheras/garages,
  "floor": número de piso,
  "age": antigüedad en años,
  "zone": "barrio o zona",
  "address": "dirección completa",
  "features": ["amenidad1","amenidad2"],
  "description": "descripción breve de 2-3 oraciones"
}

Texto: ${text}`,
      }],
    });

    const jsonMatch = message.content[0].text.match(/\{[\s\S]*\}/);
    if (jsonMatch) aiExtracted = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn('Claude extraction failed:', err.message);
  }

  // ── 6. Merge: pre-extracted (API) wins, Claude fills gaps ─────────────────
  const merged = { ...aiExtracted };
  for (const [k, v] of Object.entries(preExtracted)) {
    if (k === 'photos') continue; // handled separately
    if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)) {
      merged[k] = v;
    }
  }

  // ── 7. Final photo list ───────────────────────────────────────────────────
  const aiPhotos = (aiExtracted.photos || []).filter(u => typeof u === 'string' && u.startsWith('http'));
  const prePhotos = preExtracted.photos || [];
  const allPhotos = [...new Set([...prePhotos, ...photoSet, ...aiPhotos])]
    .filter(u => u.startsWith('http') && !SKIP_PHOTO_PATTERNS.test(u))
    .slice(0, 12);

  delete merged.photos;
  res.json({ ...merged, photos: allPhotos, sourceUrl: url });
});
