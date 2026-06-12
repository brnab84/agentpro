import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';
import { assertPublicUrl, safeFetch } from '../../utils/ssrf.js';
import { randomToken } from '../../utils/randomToken.js';
import { renderPageHtml, headlessStatus } from './render.service.js';
import * as service from './properties.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MAX_PHOTOS          = 20;
const MAX_PHOTOS_HARVEST  = 30;
const MAX_FEATURES        = 10;
const MAX_DESC_LENGTH     = 600;
const MAX_CLAUDE_TEXT     = 12_000;
const MIN_HTML_LENGTH     = 300;
const BOT_DETECT_SLICE    = 3_000;
const FETCH_TIMEOUT_MS    = 25_000;

const SKIP_PHOTO_PATTERN = /logo|icon|avatar|sprite|pixel|banner|ad[_-]|tracking|placeholder|blank|button|flag|star|heart|thumb_up|checkmark|check[_-]|verified|badge|loading|spinner|default-user|no-image|empty|favicon|captcha|recaptcha|whatsapp|facebook|instagram|googlelogo|\/svg\/|\.svg(\?|$)/i;

const BOT_BLOCK_PATTERN = /challenge-platform|cf-browser-verification|just a moment|enable javascript and cookies|checking your browser/i;

const BROWSER_HEADERS = {
  'User-Agent':          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language':     'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding':     'gzip, deflate, br',
  'Cache-Control':       'no-cache',
  'Pragma':              'no-cache',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest':      'document',
  'Sec-Fetch-Mode':      'navigate',
  'Sec-Fetch-Site':      'none',
  'Sec-Fetch-User':      '?1',
  'Sec-CH-UA':           '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-CH-UA-Mobile':    '?0',
  'Sec-CH-UA-Platform':  '"Windows"',
  'DNT':                 '1',
};

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────
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
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Safely parse a numeric value from any string/number input */
function parseNum(value) {
  if (value == null) return undefined;
  const num = parseFloat(String(value).replace(/[^\d.]/g, ''));
  return isNaN(num) ? undefined : num;
}

/** Filter a URL as a valid, non-decorative photo */
function isValidPhoto(url) {
  return typeof url === 'string' && url.startsWith('http') && !SKIP_PHOTO_PATTERN.test(url);
}

/** Recursively collect image URLs from any nested object */
function collectImagesFromObject(obj, results = new Set(), depth = 0) {
  if (depth > 10 || !obj || typeof obj !== 'object') return results;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const isImageUrl = value.startsWith('http') && /\.(jpg|jpeg|png|webp)/i.test(value);
      const isNamedUrl = /photo|image|picture|foto|imagen|url/i.test(key) && value.startsWith('http');
      if (isImageUrl || isNamedUrl) results.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(item => collectImagesFromObject(item, results, depth + 1));
    } else if (typeof value === 'object') {
      collectImagesFromObject(value, results, depth + 1);
    }
  }
  return results;
}

/** Extract photo URLs from raw HTML using multiple strategies */
function extractPhotosFromHtml(html) {
  const photos = new Set();

  // og:image / twitter:image meta tags
  for (const match of html.matchAll(/(?:og:image|twitter:image)[^>]*content=["']([^"']+)["']/gi)) photos.add(match[1]);
  for (const match of html.matchAll(/content=["']([^"']+)["'][^>]*(?:og:image|twitter:image)/gi)) photos.add(match[1]);

  // JSON-LD structured data
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(match[1]);
      [obj.image, obj.photo, ...(obj.images || [])].flat().filter(Boolean).forEach(img => {
        if (typeof img === 'string') photos.add(img);
        else if (img?.url) photos.add(img.url);
      });
    } catch (err) {
      console.warn('JSON-LD parse error:', err.message);
    }
  }

  // Lazy-load data attributes
  for (const match of html.matchAll(/(?:data-src|data-lazy-src|data-original|data-full-src|data-image)=["']([^"']{20,})["']/gi)) {
    if (match[1].startsWith('http') && /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(match[1])) photos.add(match[1]);
  }

  // Standard src attributes
  for (const match of html.matchAll(/\bsrc=["']([^"']{20,})["']/gi)) {
    if (match[1].startsWith('http') && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(match[1])) photos.add(match[1]);
  }

  // srcset (responsive galleries): take each candidate URL
  for (const match of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
    for (const part of match[1].split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (u?.startsWith('http') && /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(u)) photos.add(u);
    }
  }

  // JSON string values containing image URLs (keys: url/src/image/thumbnail/...)
  for (const match of html.matchAll(/"(?:url|src|image|imageUrl|image_url|thumbnail|picture|photo)"\s*:\s*"(https?:\/\/[^"]{15,})"/gi)) {
    if (/\.(jpg|jpeg|png|webp|avif)(\?|\\u|$)/i.test(match[1])) photos.add(match[1].replace(/\\\//g, '/'));
  }

  // Bare image URLs anywhere in scripts/JSON
  for (const match of html.matchAll(/"(https?:\/\/[^"]{15,}\.(jpg|jpeg|png|webp|avif)(?:\?[^"]{0,120})?)"/gi)) {
    photos.add(match[1].replace(/\\\//g, '/'));
  }

  // Image-CDN URLs WITHOUT a file extension (Encuentra24, MercadoLibre static,
  // Cloudinary). These are real photos served via transform URLs.
  for (const match of html.matchAll(/https?:\/\/(?:photos\.encuentra24\.com|[a-z0-9.-]*mlstatic\.com|res\.cloudinary\.com)\/[^"'\s\\)<>]+/gi)) {
    photos.add(match[0].replace(/\\\//g, '/'));
  }

  return [...photos].filter(isValidPhoto).slice(0, MAX_PHOTOS_HARVEST);
}

// ─────────────────────────────────────────────────────────────────────────────
// MercadoLibre HTML parser (no REST API — parses page source directly)
// ─────────────────────────────────────────────────────────────────────────────

/** Strategy 1: application/ld+json Product schema */
function extractMlJsonLd(html, result, photoSet) {
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(match[1]);
      if (obj['@type'] !== 'Product' && obj['@type'] !== 'Offer') continue;
      if (obj.name && !result.title)       result.title       = obj.name;
      if (obj.description && !result.description) result.description = String(obj.description).slice(0, MAX_DESC_LENGTH);
      const offer = obj.offers || obj;
      if (offer.price && !result.price) {
        result.price    = parseNum(offer.price);
        result.currency = offer.priceCurrency || 'USD';
      }
      [obj.image, ...(obj.images || [])].flat().filter(Boolean).forEach(img => {
        const url = typeof img === 'string' ? img : img?.url;
        if (url?.startsWith('http')) photoSet.add(url);
      });
    } catch (err) {
      console.warn('ML JSON-LD parse error:', err.message);
    }
  }
}

/** Strategy 2: window.__PRELOADED_STATE__ */
function extractMlPreloadedState(html, result, photoSet) {
  const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})(?:\s*;|\s*<\/script>)/);
  if (!stateMatch) return;
  try {
    const state = JSON.parse(stateMatch[1]);
    collectImagesFromObject(state, photoSet);

    const walk = (obj, depth = 0) => {
      if (depth > 6 || !obj || typeof obj !== 'object') return;
      if (!result.price && obj.price != null) {
        const parsed = parseNum(obj.price);
        if (parsed && parsed > 100) {
          result.price    = parsed;
          result.currency = obj.currency_id || obj.currency || 'USD';
        }
      }
      if (!result.title && typeof obj.title === 'string' && obj.title.length > 5) result.title = obj.title;
      for (const value of Object.values(obj)) {
        if (value && typeof value === 'object') walk(value, depth + 1);
      }
    };
    walk(state);
  } catch (err) {
    console.warn('ML __PRELOADED_STATE__ parse error:', err.message);
  }
}

/** Strategy 3: inline script JSON blobs and price patterns */
function extractMlScriptBlobs(html, result, photoSet) {
  const scriptPattern = /<script(?:\s[^>]*)?>([^<]{200,})<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const scriptContent = match[1];

    // Pattern: "price":{"amount":150000,"currency":"USD"}
    if (!result.price) {
      const amountMatch = scriptContent.match(/"price"\s*:\s*\{\s*"amount"\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"currency"\s*:\s*"([A-Z]{2,4})"/);
      if (amountMatch) { result.price = parseNum(amountMatch[1]); result.currency = amountMatch[2]; }
    }

    // Pattern: "value":150000,"currencyId":"USD"
    if (!result.price) {
      const valueMatch = scriptContent.match(/"value"\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"currencyId"\s*:\s*"([A-Z]{2,4})"/);
      if (valueMatch) { result.price = parseNum(valueMatch[1]); result.currency = valueMatch[2]; }
    }

    // Try to parse the whole script tag as JSON
    const trimmed = scriptContent.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const obj = JSON.parse(trimmed);
        if (obj.title || obj.price || obj.attributes) {
          if (!result.title && obj.title)      result.title = obj.title;
          if (!result.price && obj.price)      result.price = parseNum(obj.price);
          if (!result.currency && obj.currency_id) result.currency = obj.currency_id;
          if (!result.description && obj.plain_text) result.description = String(obj.plain_text).slice(0, MAX_DESC_LENGTH);
          if (Array.isArray(obj.attributes) && !result._mlAttributes) result._mlAttributes = obj.attributes;
          collectImagesFromObject(obj, photoSet);
        }
      } catch {
        // Not valid JSON — skip silently
      }
    }
  }
}

/** Strategy 4: regex fallback against rendered HTML */
function extractMlRegexFallback(html, result) {
  if (!result.title) {
    const titleMatch = html.match(/<h1[^>]*class="[^"]*ui-pdp-title[^"]*"[^>]*>([^<]+)<\/h1>/i)
                    || html.match(/<h1[^>]*>([^<]{10,120})<\/h1>/);
    if (titleMatch) result.title = titleMatch[1].trim();
  }

  if (!result.price) {
    const fractionMatch = html.match(/andes-money-amount__fraction[^>]*>([0-9.,]+)</i);
    if (fractionMatch) result.price = parseNum(fractionMatch[1]);
    if (!result.currency) {
      const symbolMatch = html.match(/andes-money-amount__currency-symbol[^>]*>([^<]{1,5})</i);
      if (symbolMatch) {
        const symbol = symbolMatch[1].trim();
        result.currency = symbol === '$' ? 'ARS' : (symbol === 'U$S' || symbol === 'USD') ? 'USD' : symbol;
      }
    }
  }

  if (!result.address) {
    const locationMatch = html.match(/ui-pdp-header__location[^>]*>([^<]+)/i)
                       || html.match(/class="[^"]*location[^"]*"[^>]*>\s*<[^>]+>\s*([^<]{5,80})/i);
    if (locationMatch) result.address = locationMatch[1].trim().replace(/\s+/g, ' ');
  }
}

/** Strategy 5: parse ML attributes array collected by strategy 3 */
function parseMlAttributes(result) {
  if (!result._mlAttributes) return;
  const attrMap = {};
  for (const attr of result._mlAttributes) {
    if (attr.value_name && attr.value_name !== 'No') {
      if (attr.id)   attrMap[attr.id.toLowerCase()]   = attr.value_name;
      if (attr.name) attrMap[attr.name.toLowerCase()] = attr.value_name;
    }
  }
  delete result._mlAttributes;

  result.beds     = parseNum(attrMap['rooms'] || attrMap['bedrooms'] || attrMap['dormitorios'] || attrMap['habitaciones'] || attrMap['ambientes']);
  result.baths    = parseNum(attrMap['bathrooms'] || attrMap['bathrooms_quantity'] || attrMap['baños'] || attrMap['banos']);
  result.area     = parseNum(attrMap['covered_area'] || attrMap['superficie_cubierta'] || attrMap['floor_space'] || attrMap['superficie']);
  result.areaTotal= parseNum(attrMap['total_area'] || attrMap['superficie_total'] || attrMap['land_area']);
  result.parking  = parseNum(attrMap['parking_lots'] || attrMap['cocheras'] || attrMap['garage']);
  result.floor    = parseNum(attrMap['floor'] || attrMap['piso'] || attrMap['floor_number']);
  result.age      = parseNum(attrMap['property_age'] || attrMap['antiguedad'] || attrMap['antigüedad']);
}

/** Infer operation and property type from text content */
function inferTypeAndOperation(textContent, result) {
  const text = textContent.toLowerCase();
  if (!result.operation) {
    result.operation = (text.includes('alquiler') || text.includes('arriendo') || text.includes('para alquilar')) ? 'rent' : 'sale';
  }
  if (!result.type) {
    result.type = text.includes('departamento') || text.includes('depto') || text.includes('apartamento') ? 'apartment'
                : text.includes('terreno') || text.includes('lote')      ? 'land'
                : text.includes('local comercial')                        ? 'commercial'
                : text.includes('oficina')                                ? 'office'
                : text.includes('depósito') || text.includes('galpón')   ? 'warehouse'
                : 'house';
  }
}

/** Main ML HTML parser — orchestrates all strategies */
function parseMlHtml(html) {
  const result   = {};
  const photoSet = new Set();

  extractMlJsonLd(html, result, photoSet);
  extractMlPreloadedState(html, result, photoSet);
  extractMlScriptBlobs(html, result, photoSet);
  extractMlRegexFallback(html, result);
  parseMlAttributes(result);
  inferTypeAndOperation(html.slice(0, 3_000), result);

  // ML CDN photos (convert to original size)
  for (const match of html.matchAll(/"(https?:\/\/http2\.mlstatic\.com\/[^"]{10,}\.(?:jpg|jpeg|webp))"/gi)) {
    photoSet.add(match[1].replace(/-[A-Z]\.jpg$/i, '-O.jpg'));
  }

  extractPhotosFromHtml(html).forEach(url => photoSet.add(url));
  result.photos = [...photoSet].filter(isValidPhoto).slice(0, MAX_PHOTOS);

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// __NEXT_DATA__ parser (ZonaProp, Argenprop, Navent, etc.)
// ─────────────────────────────────────────────────────────────────────────────
function parseNextData(nextData) {
  const result = {};

  const walkNode = (node, depth = 0) => {
    if (depth > 8 || !node || typeof node !== 'object') return;

    if (node.operations?.[0]) {
      const op = node.operations[0];
      const isRent = op.operationType?.id === 'Rent' || op.operationType?.name?.toLowerCase().includes('alquiler');
      if (!result.operation) result.operation = isRent ? 'rent' : 'sale';
      if (!result.price && op.prices?.[0]) {
        result.price    = op.prices[0].price;
        result.currency = op.prices[0].currency || 'USD';
      }
    }

    if (!result.address) result.address = node.addressFormatted || node.address || node.location?.full || null;
    if (!result.zone && node.location?.divisions?.length) {
      result.zone = node.location.divisions.at(-1)?.prettyName || '';
    }

    if (node.mainFeatures?.length) {
      for (const feature of node.mainFeatures) {
        const key   = (feature.icon || feature.key || '').toLowerCase();
        const value = feature.value || feature.label || '';
        if (!result.beds    && (key.includes('room') || key.includes('dormit'))) result.beds     = parseNum(value);
        if (!result.baths   && key.includes('bath'))                             result.baths    = parseNum(value);
        if (!result.area    && (key.includes('superf') || key.includes('cubierta'))) result.area = parseNum(value);
        if (!result.areaTotal && key.includes('total'))                          result.areaTotal= parseNum(value);
        if (!result.parking && (key.includes('garag') || key.includes('coche'))) result.parking = parseNum(value);
        if (result.floor  == null && (key.includes('piso') || key.includes('floor'))) result.floor = parseNum(value);
        if (result.age    == null && (key.includes('antig') || key.includes('age')))  result.age   = parseNum(value);
      }
    }

    if (!result.title       && typeof node.title       === 'string' && node.title.length > 5)  result.title = node.title;
    if (!result.description && typeof node.description === 'string' && node.description.length > 20) {
      result.description = node.description.slice(0, MAX_DESC_LENGTH);
    }
    if (!result.features?.length) {
      const amenities = node.amenities || node.allFeatures || node.tags || [];
      if (amenities.length) result.features = amenities.map(a => a.name || a.label || a).filter(Boolean).slice(0, MAX_FEATURES);
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') walkNode(value, depth + 1);
    }
  };

  walkNode(nextData);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Import from URL — main endpoint
// ─────────────────────────────────────────────────────────────────────────────
/** Parse already-fetched HTML (+ optional browser-collected images) into a property. */
async function parseHtmlToProperty(html, url, providedImages = []) {
  const photoSet = new Set();
  providedImages.filter(isValidPhoto).forEach(p => photoSet.add(p));
  const structured   = await extractStructuredData(html, url, photoSet);
  const strippedText = stripHtmlForClaude(html);
  const aiData       = await extractWithClaude(strippedText, structured);

  const merged       = mergeExtractions(aiData, structured);
  const galleryFirst = [...providedImages.filter(isValidPhoto), ...(structured.photos || [])];
  const photos       = buildFinalPhotoList(galleryFirst, photoSet, aiData.photos || []);
  delete merged.photos;
  return { merged, photos };
}

export const importFromUrl = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) throw new AppError('url is required', 400);
  await assertPublicUrl(url); // SSRF guard (blocks internal/metadata hosts)

  const headers = buildFetchHeaders(url);
  const { html, method, renderedImages } = await fetchHtml(url, headers);
  validateHtmlContent(html, url);

  const { merged, photos } = await parseHtmlToProperty(html, url, renderedImages || []);

  const fieldCount = Object.values(merged).filter(v => v != null && v !== '' && !(Array.isArray(v) && !v.length)).length;
  console.log(`import-url: ${fieldCount} fields, ${photos.length} photos, method=${method}, html=${html.length}b — ${url}`);

  res.json({
    ...merged, photos, sourceUrl: url,
    _debug: { method, htmlBytes: html.length, fields: fieldCount, photos: photos.length, headless: headlessStatus() },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Browser bookmarklet import — receives HTML from the user's own browser/IP,
// so it bypasses datacenter-IP blocks (MercadoLibre, ZonaProp, etc.).
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/properties/import-key — return (creating if needed) the tenant's import key. */
export const getImportKey = asyncHandler(async (req, res) => {
  const { Tenant } = await import('../../models/Tenant.js');
  const tenant = await Tenant.findById(req.tenantId);
  if (!tenant) throw new AppError('Cuenta no encontrada', 404);
  if (!tenant.importKey) {
    tenant.importKey = randomToken();
    await tenant.save();
  }
  res.json({ importKey: tenant.importKey });
});

/** POST /api/properties/import-key/regenerate — issue a new import key. */
export const regenerateImportKey = asyncHandler(async (req, res) => {
  const { Tenant } = await import('../../models/Tenant.js');
  const tenant = await Tenant.findById(req.tenantId);
  if (!tenant) throw new AppError('Cuenta no encontrada', 404);
  tenant.importKey = randomToken();
  await tenant.save();
  res.json({ importKey: tenant.importKey });
});

/** POST /api/properties/import-from-html?key=... — create a property from page HTML. */
export const importFromHtml = asyncHandler(async (req, res) => {
  const key = req.query.key || req.body?.key;
  if (!key) throw new AppError('Falta la clave de importación', 401);

  const { Tenant } = await import('../../models/Tenant.js');
  const tenant = await Tenant.findOne({ importKey: String(key) });
  if (!tenant) throw new AppError('Clave de importación inválida', 401);

  const { url, html, images } = req.body || {};
  if (!html || html.length < MIN_HTML_LENGTH) throw new AppError('No se recibió el contenido de la página', 400);

  // Respect the plan's property limit.
  const { assertCanAddProperty } = await import('../billing/limits.service.js');
  await assertCanAddProperty(tenant._id);

  const { merged, photos } = await parseHtmlToProperty(html, url || '', Array.isArray(images) ? images : []);
  const data = pickPropertyFields(merged);
  data.photos = photos;
  data.sourceUrl = url || '';
  if (!data.title) data.title = 'Propiedad importada';

  const property = await service.create(tenant._id, data);
  console.log(`import-from-html: created ${property._id}, ${photos.length} photos — ${url}`);
  res.json({ ok: true, id: property._id, title: property.title, photos: photos.length });
});

/** Whitelist only known property fields from extracted data (prevents mass assignment). */
function pickPropertyFields(obj) {
  const ALLOWED = ['title','zone','address','price','currency','operation','type',
    'description','area','areaTotal','beds','baths','parking','floor','age','features'];
  const out = {};
  for (const k of ALLOWED) if (obj[k] != null && obj[k] !== '') out[k] = obj[k];
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Import helpers (private)
// ─────────────────────────────────────────────────────────────────────────────

function buildFetchHeaders(url) {
  const headers = { ...BROWSER_HEADERS };
  if (/mercadolibre\.|meli\.com/i.test(url)) {
    headers['Referer']        = 'https://www.mercadolibre.com.ar/';
    headers['Sec-Fetch-Site'] = 'same-origin';
  } else if (/zonaprop\.com/i.test(url)) {
    headers['Referer'] = 'https://www.zonaprop.com.ar/';
    headers['Cookie']  = '';
  } else if (/argenprop\.com/i.test(url)) {
    headers['Referer'] = 'https://www.argenprop.com/';
  } else if (/encuentra24\.com/i.test(url)) {
    headers['Referer'] = 'https://www.encuentra24.com/';
  }
  return headers;
}

/**
 * Fetch the page HTML through a JS-rendering scraping provider (ScraperAPI or
 * ScrapingBee). These render JavaScript and rotate residential proxies, so they
 * get the full gallery and bypass Cloudflare. Returns null if not configured.
 */
async function fetchHtmlViaProvider(url) {
  if (!env.scraperApiKey) return null;
  const key = env.scraperApiKey;
  let apiUrl;
  if (env.scraperProvider === 'scrapingbee') {
    apiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${key}` +
      `&url=${encodeURIComponent(url)}&render_js=true&premium_proxy=true&wait=3000`;
  } else { // scraperapi (default)
    apiUrl = `https://api.scraperapi.com/?api_key=${key}` +
      `&url=${encodeURIComponent(url)}&render=true&country_code=us`;
  }
  const response = await fetch(apiUrl, { signal: AbortSignal.timeout(70_000) });
  if (!response.ok) throw new Error(`proveedor de scraping HTTP ${response.status}`);
  return await response.text();
}

/** Returns { html, method, renderedImages } where method is headless | provider | direct. */
async function fetchHtml(url, headers) {
  // 1) Self-hosted headless Chromium with stealth (renders JS galleries)
  if (env.useHeadless) {
    try {
      const { html, images } = await renderPageHtml(url);
      if (html && html.length > MIN_HTML_LENGTH) {
        console.log(`import-url: headless rendered ${html.length}b, ${images.length} gallery imgs`);
        return { html, method: 'headless', renderedImages: images || [] };
      }
    } catch (err) {
      console.warn('import-url: headless render error, continuing:', err.message);
    }
  }
  // 2) External rendering provider, if configured (handles hard Cloudflare)
  if (env.scraperApiKey) {
    try {
      const html = await fetchHtmlViaProvider(url);
      if (html && html.length > MIN_HTML_LENGTH) return { html, method: 'provider', renderedImages: [] };
      console.warn('import-url: provider returned little/no HTML, falling back to direct fetch');
    } catch (err) {
      console.warn('import-url: scraping provider failed, falling back to direct fetch:', err.message);
    }
  }
  // 3) Plain direct fetch (SSRF-safe: validates every redirect hop)
  try {
    const response = await safeFetch(url, { headers, timeoutMs: FETCH_TIMEOUT_MS });
    if (!response.ok) console.warn(`import-url: HTTP ${response.status} for ${url} (proceeding anyway)`);
    return { html: await response.text(), method: 'direct', renderedImages: [] };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`No se pudo acceder a la URL: ${err.message}`, 422);
  }
}

function validateHtmlContent(html, url) {
  if (html.length < MIN_HTML_LENGTH) {
    throw new AppError('El portal bloqueó el acceso automático. Copiá los datos manualmente.', 422);
  }
  const isBotBlock = BOT_BLOCK_PATTERN.test(html.slice(0, BOT_DETECT_SLICE));
  if (isBotBlock && html.length < 5_000) {
    const portalName = /zonaprop/i.test(url) ? 'ZonaProp' : /argenprop/i.test(url) ? 'Argenprop' : 'El portal';
    throw new AppError(`${portalName} bloqueó el acceso automático (protección anti-bots). Copiá los datos manualmente.`, 422);
  }
}

async function extractStructuredData(html, url, photoSet) {
  const isMl = /mercadolibre\.|meli\.com/i.test(url);
  let structured = {};

  if (isMl) {
    try {
      structured = parseMlHtml(html);
      (structured.photos || []).forEach(p => photoSet.add(p));
      console.log('ML HTML parse — title:', structured.title || '(none)', '| price:', structured.price);
    } catch (err) {
      console.warn('ML HTML parse error:', err.message);
    }
  }

  // __NEXT_DATA__ (ZonaProp, Argenprop, etc.)
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nextData  = JSON.parse(nextDataMatch[1]);
      const fromNext  = parseNextData(nextData);
      collectImagesFromObject(nextData, photoSet);
      // Merge — structured data from API wins
      for (const [key, value] of Object.entries(fromNext)) {
        if (!structured[key] && value != null && !(Array.isArray(value) && !value.length)) {
          structured[key] = value;
        }
      }
      console.log('__NEXT_DATA__ parsed — title:', fromNext.title || '(none)');
    } catch (err) {
      console.warn('__NEXT_DATA__ parse error:', err.message);
    }
  }

  extractPhotosFromHtml(html).forEach(url => photoSet.add(url));
  return structured;
}

function stripHtmlForClaude(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CLAUDE_TEXT);
}

async function extractWithClaude(text, alreadyExtracted) {
  try {
    const client = getAnthropic();
    const existingDataHint = Object.entries(alreadyExtracted)
      .filter(([key, value]) => key !== 'photos' && value != null && !(Array.isArray(value) && !value.length))
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ');

    const existingHint = existingDataHint
      ? `\n\nYa extraído (usá estos valores, no los repitas a menos que el texto los contradiga): ${existingDataHint}\n`
      : '';

    const response = await client.messages.create({
      model:      env.aiModel,
      max_tokens: 900,
      messages: [{
        role:    'user',
        content: `${existingHint}
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

    const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (err) {
    console.warn('Claude extraction error:', err.message);
    return {};
  }
}

function mergeExtractions(aiData, structuredData) {
  const merged = { ...aiData };
  for (const [key, value] of Object.entries(structuredData)) {
    if (key === 'photos') continue;
    if (value != null && !(Array.isArray(value) && !value.length)) merged[key] = value;
  }
  return merged;
}

/** A stable key per actual photo, so the same image at different CDN transform
 *  sizes (common on Encuentra24) collapses to one. */
function photoKey(url) {
  const enc = url.match(/photos\.encuentra24\.com\/[^?]*\/(\d+_[a-z0-9]+)/i);
  if (enc) return 'e24:' + enc[1];
  const ml = url.match(/(?:mlstatic\.com)\/([A-Z]?_?[\w-]+?)(?:-[A-Z])?\.(?:jpg|jpeg|png|webp)/i);
  if (ml) return 'ml:' + ml[1];
  return url.split('?')[0];
}

function buildFinalPhotoList(structuredPhotos, photoSet, aiPhotos) {
  const validAiPhotos = aiPhotos.filter(url => typeof url === 'string' && url.startsWith('http'));
  const all = [...structuredPhotos, ...photoSet, ...validAiPhotos].filter(isValidPhoto);
  const seen = new Set();
  const out = [];
  for (const url of all) {
    const key = photoKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}
