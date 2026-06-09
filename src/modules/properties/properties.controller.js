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

/** Base headers that mimic a real Chrome browser */
const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Sec-CH-UA': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
  'DNT': '1',
};

const SKIP_PHOTO = /logo|icon|avatar|sprite|pixel|banner|ad[_\-]|tracking|placeholder|blank|button|flag|star|heart|thumb_up|checkmark|loading|default-user|no-image|empty|favicon|captcha|recaptcha/i;

const parseNum = v => {
  if (v == null) return undefined;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return isNaN(n) ? undefined : n;
};

function harvestPhotos(html) {
  const set = new Set();
  for (const m of html.matchAll(/(?:og:image|twitter:image)[^>]*content=["']([^"']+)["']/gi)) set.add(m[1]);
  for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*(?:og:image|twitter:image)/gi)) set.add(m[1]);
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(m[1]);
      [obj.image, obj.photo, ...(obj.images||[])].flat().filter(Boolean)
        .forEach(i => typeof i === 'string' ? set.add(i) : i?.url && set.add(i.url));
    } catch { /* ignore */ }
  }
  for (const m of html.matchAll(/(?:data-src|data-lazy-src|data-original|data-full-src|data-image)=["']([^"']{20,})["']/gi)) {
    if (m[1].startsWith('http') && /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(m[1])) set.add(m[1]);
  }
  for (const m of html.matchAll(/\bsrc=["']([^"']{20,})["']/gi)) {
    if (m[1].startsWith('http') && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(m[1])) set.add(m[1]);
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// MercadoLibre HTML Parser
// Parses JSON embedded directly in the ML page HTML (no REST API needed)
// ─────────────────────────────────────────────────────────────────────────────
function parseMlHtml(html) {
  const r = {};
  const photoSet = new Set();

  // ── Strategy 1: application/ld+json Product schema ──────────────────────
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj['@type'] === 'Product' || obj['@type'] === 'Offer') {
        if (obj.name && !r.title) r.title = obj.name;
        if (obj.description && !r.description) r.description = String(obj.description).slice(0, 600);
        const offer = obj.offers || obj;
        if (offer.price && !r.price) { r.price = parseNum(offer.price); r.currency = offer.priceCurrency || 'USD'; }
        [obj.image, ...(obj.images || [])].flat().filter(Boolean).forEach(i => {
          const u = typeof i === 'string' ? i : i?.url;
          if (u?.startsWith('http')) photoSet.add(u);
        });
      }
    } catch { /* ignore */ }
  }

  // ── Strategy 2: window.__PRELOADED_STATE__ ────────────────────────────────
  const preloadedMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})(?:\s*;|\s*<\/script>)/);
  if (preloadedMatch) {
    try {
      const state = JSON.parse(preloadedMatch[1]);
      deepImages(state, photoSet);
      // Walk deep to find item data
      const walk = (obj, depth = 0) => {
        if (depth > 6 || !obj || typeof obj !== 'object') return;
        // Look for price data
        if (!r.price && (obj.price != null)) {
          const p = parseNum(obj.price);
          if (p && p > 100) { r.price = p; r.currency = obj.currency_id || obj.currency || 'USD'; }
        }
        if (!r.title && obj.title && typeof obj.title === 'string' && obj.title.length > 5) r.title = obj.title;
        for (const v of Object.values(obj)) {
          if (v && typeof v === 'object') walk(v, depth + 1);
        }
      };
      walk(state);
    } catch { /* ignore */ }
  }

  // ── Strategy 3: Nordic (ML's internal data layer) script tags ─────────────
  // ML embeds property data in <script> tags as JS assignments or JSON blobs
  const scriptRe = /<script(?:\s[^>]*)?>([^<]{200,})<\/script>/gi;
  for (const m of html.matchAll(scriptRe)) {
    const s = m[1];
    // Look for patterns like: "price":{"amount":150000,"currency":"USD"}
    if (!r.price) {
      const pm = s.match(/"price"\s*:\s*\{\s*"amount"\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"currency"\s*:\s*"([A-Z]{2,4})"/);
      if (pm) { r.price = parseNum(pm[1]); r.currency = pm[2]; }
    }
    // "price":{"value":150000,"currencyId":"USD"}
    if (!r.price) {
      const pm2 = s.match(/"value"\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"currencyId"\s*:\s*"([A-Z]{2,4})"/);
      if (pm2) { r.price = parseNum(pm2[1]); r.currency = pm2[2]; }
    }
    // Try to parse as JSON if it looks like a complete object
    if (s.trim().startsWith('{') && s.trim().endsWith('}')) {
      try {
        const obj = JSON.parse(s.trim());
        if (obj.title || obj.price || obj.attributes) {
          if (!r.title && obj.title) r.title = obj.title;
          if (!r.price && obj.price) { r.price = parseNum(obj.price); }
          if (!r.currency && obj.currency_id) r.currency = obj.currency_id;
          deepImages(obj, photoSet);
          // Parse attributes array if present
          if (Array.isArray(obj.attributes) && !r.beds) {
            r._mlAttributes = obj.attributes;
          }
          if (!r.description && obj.plain_text) r.description = String(obj.plain_text).slice(0, 600);
        }
      } catch { /* ignore */ }
    }
  }

  // ── Strategy 4: Regex extraction from raw HTML ────────────────────────────
  if (!r.title) {
    const tm = html.match(/<h1[^>]*class="[^"]*ui-pdp-title[^"]*"[^>]*>([^<]+)<\/h1>/i)
            || html.match(/<h1[^>]*>([^<]{10,120})<\/h1>/);
    if (tm) r.title = tm[1].trim();
  }
  if (!r.price) {
    // <span class="andes-money-amount__fraction">150.000</span>
    const pm = html.match(/andes-money-amount__fraction[^>]*>([0-9.,]+)</i);
    if (pm) r.price = parseNum(pm[1]);
    // currency
    const cm = html.match(/andes-money-amount__currency-symbol[^>]*>([^<]{1,5})</i);
    if (cm && !r.currency) {
      const cs = cm[1].trim();
      r.currency = cs === '$' ? 'ARS' : cs === 'U$S' || cs === 'USD' ? 'USD' : cs;
    }
  }
  // Location from breadcrumbs or meta
  if (!r.address) {
    const locM = html.match(/ui-pdp-header__location[^>]*>([^<]+)/i)
              || html.match(/class="[^"]*location[^"]*"[^>]*>\s*<[^>]+>\s*([^<]{5,80})/i);
    if (locM) r.address = locM[1].trim().replace(/\s+/g, ' ');
  }

  // ── Strategy 5: Parse attributes if collected ─────────────────────────────
  if (r._mlAttributes) {
    const attr = {};
    for (const a of r._mlAttributes) {
      if (a.value_name && a.value_name !== 'No') {
        if (a.id) attr[a.id.toLowerCase()] = a.value_name;
        if (a.name) attr[a.name.toLowerCase()] = a.value_name;
      }
    }
    r.beds     = parseNum(attr['rooms'] || attr['bedrooms'] || attr['dormitorios'] || attr['habitaciones'] || attr['ambientes'] || attr['property_rooms']);
    r.baths    = parseNum(attr['bathrooms'] || attr['bathrooms_quantity'] || attr['baños'] || attr['banos']);
    r.area     = parseNum(attr['covered_area'] || attr['superficie_cubierta'] || attr['floor_space'] || attr['superficie'] || attr['surface_covered']);
    r.areaTotal= parseNum(attr['total_area'] || attr['superficie_total'] || attr['land_area'] || attr['total_surface']);
    r.parking  = parseNum(attr['parking_lots'] || attr['cocheras'] || attr['garage'] || attr['covered_parking_lots']);
    r.floor    = parseNum(attr['floor'] || attr['piso'] || attr['floor_number']);
    r.age      = parseNum(attr['property_age'] || attr['antiguedad'] || attr['antigüedad']);
    delete r._mlAttributes;
  }

  // ── Strategy 6: Infer type and operation from title/URL ──────────────────
  const tl = (r.title || '').toLowerCase() + ' ' + html.slice(0, 2000).toLowerCase();
  if (!r.operation) {
    r.operation = (tl.includes('alquiler') || tl.includes('arriendo') || tl.includes('en alquiler') || tl.includes('para alquilar')) ? 'rent' : 'sale';
  }
  if (!r.type) {
    r.type = tl.includes('departamento') || tl.includes('depto') || tl.includes('apartamento') ? 'apartment'
           : tl.includes('terreno') || tl.includes('lote') ? 'land'
           : tl.includes('local comercial') ? 'commercial'
           : tl.includes('oficina') ? 'office'
           : tl.includes('depósito') || tl.includes('deposito') || tl.includes('galpón') ? 'warehouse'
           : 'house';
  }

  // ── Photos ─────────────────────────────────────────────────────────────────
  // ML uses https://http2.mlstatic.com/D_NQ_NP_*-O.jpg for original size
  for (const m of html.matchAll(/"(https?:\/\/http2\.mlstatic\.com\/[^"]{10,}\.(?:jpg|jpeg|webp))"/gi)) {
    photoSet.add(m[1].replace(/-[A-Z]\.jpg$/i, '-O.jpg'));
  }
  harvestPhotos(html).forEach(u => photoSet.add(u));
  r.photos = [...photoSet].filter(u => u.startsWith('http') && !SKIP_PHOTO.test(u)).slice(0, 12);

  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// __NEXT_DATA__ parser (ZonaProp, Argenprop, Encuentra24, etc.)
// ─────────────────────────────────────────────────────────────────────────────
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

  // Detect portal
  const isMl       = /mercadolibre\.|mercadolibre\.com|meli\.com/i.test(url);
  const isZonaProp  = /zonaprop\.com/i.test(url);
  const isArgenprop = /argenprop\.com/i.test(url);
  const isInmuebles = /inmuebles24\.com|properati\.com|navent\.com/i.test(url);

  // Build fetch headers tailored to each portal
  const headers = { ...BASE_HEADERS };
  if (isMl) {
    headers['Referer'] = 'https://www.mercadolibre.com.ar/';
    headers['Origin']  = 'https://www.mercadolibre.com.ar';
    headers['Sec-Fetch-Site'] = 'same-origin';
  } else if (isZonaProp) {
    headers['Referer'] = 'https://www.zonaprop.com.ar/';
    headers['Cookie']  = '';   // empty cookie avoids bot-score spikes from missing session
  } else if (isArgenprop) {
    headers['Referer'] = 'https://www.argenprop.com/';
  }

  // 1. Fetch HTML
  let html = '';
  let fetchStatus = 0;
  try {
    const resp = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(25000),
      redirect: 'follow',
    });
    fetchStatus = resp.status;
    html = await resp.text();
    if (!resp.ok) console.warn(`import-url: HTTP ${resp.status} for ${url} (trying anyway)`);
  } catch (err) {
    throw new AppError(`No se pudo acceder a la URL: ${err.message}`, 422);
  }

  if (html.length < 300) {
    throw new AppError('El portal bloqueó el acceso automático. Copiá los datos manualmente o intentá en unos minutos.', 422);
  }

  // Detect Cloudflare / bot block page (has HTML but no real content)
  const isBotBlock = /challenge-platform|cf-browser-verification|just a moment|enable javascript and cookies|checking your browser/i.test(html.slice(0, 3000));
  if (isBotBlock && html.length < 5000) {
    throw new AppError(
      `${isZonaProp ? 'ZonaProp' : isArgenprop ? 'Argenprop' : 'El portal'} bloqueó el acceso automático (protección anti-bots). ` +
      'Copiá el título, precio y descripción del aviso y usá el formulario manual.',
      422,
    );
  }

  const photoSet = new Set();
  let preExtracted = {};

  // ── 2. MercadoLibre: parse HTML directly (no REST API) ────────────────────
  if (isMl) {
    try {
      const mlData = parseMlHtml(html);
      if (mlData.photos?.length) mlData.photos.forEach(p => photoSet.add(p));
      preExtracted = mlData;
      console.log('ML HTML parse result:', preExtracted.title || '(no title)', 'price:', preExtracted.price);
    } catch (err) {
      console.warn('ML HTML parse error:', err.message);
    }
  }

  // ── 3. __NEXT_DATA__ (ZonaProp, Argenprop, Navent, etc.) ──────────────────
  const ndMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ndMatch) {
    try {
      const nd = JSON.parse(ndMatch[1]);
      const fromNext = parseNextData(nd);
      for (const [k, v] of Object.entries(fromNext)) {
        if (!preExtracted[k] && v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) {
          preExtracted[k] = v;
        }
      }
      deepImages(nd, photoSet);
      console.log('__NEXT_DATA__ parsed, title:', fromNext.title || '(none)');
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
      .filter(([k, v]) => k !== 'photos' && v != null && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');

    const hint = alreadyHave ? `\n\nYa extraído (usá estos valores, no los repitas a menos que el texto los contradiga): ${alreadyHave}\n` : '';

    const msg = await client.messages.create({
      model: env.aiModel,
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: `${hint}
Extraé todos los datos de esta propiedad inmobiliaria del texto y devolvé SOLO un JSON válido.
Campos (omití los que no puedas determinar con certeza):
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

  // ── 7. Merge: structured parsers win; Claude fills gaps ───────────────────
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
  console.log(`import-url: ${fieldsFilled} fields, ${allPhotos.length} photos for ${url}`);

  // If virtually nothing extracted and we got a block, give useful error
  if (fieldsFilled < 2 && isBotBlock) {
    throw new AppError('No se pudieron extraer datos — el portal bloqueó el acceso. Completá el formulario manualmente.', 422);
  }

  res.json({ ...merged, photos: allPhotos, sourceUrl: url });
});
