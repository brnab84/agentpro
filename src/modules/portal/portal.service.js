import { Tenant }   from '../../models/Tenant.js';
import { Property } from '../../models/Property.js';
import { Lead }     from '../../models/Lead.js';
import { AppError } from '../../utils/AppError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { assertPublicUrl, safeFetch } from '../../utils/ssrf.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MAX_PROPERTIES_PER_PAGE = 20;

const PUBLIC_PROPERTY_FIELDS = [
  'title', 'zone', 'address', 'price', 'currency', 'operation',
  'type', 'status', 'description', 'area', 'areaTotal',
  'beds', 'baths', 'parking', 'floor', 'age', 'features', 'photos',
  'publishedOnPortal', 'createdAt',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_KEYS = ['properties', 'about', 'whyUs', 'testimonials', 'contact'];
/** Validate the section order: only known keys, de-duplicated, all keys present. */
function sanitizeSectionOrder(arr) {
  const seen = new Set();
  const out = [];
  for (const k of Array.isArray(arr) ? arr : []) {
    if (SECTION_KEYS.includes(k) && !seen.has(k)) { seen.add(k); out.push(k); }
  }
  for (const k of SECTION_KEYS) if (!seen.has(k)) out.push(k); // append any missing
  return out;
}

/** Clamp a number into [min,max], falling back to `def` when not a finite number. */
function clampNumber(v, min, max, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** Generate a URL-safe slug from a string */
export function buildSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/** Find a tenant by slug, throws 404 if not found or portal not active */
async function findActiveTenant(slug) {
  const tenant = await Tenant.findOne({ slug });
  if (!tenant) throw new AppError('Portal no encontrado', 404);
  if (!tenant.portal?.active) throw new AppError('Este portal no está disponible', 404);
  return tenant;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public queries
// ─────────────────────────────────────────────────────────────────────────────

/** Return portal config + paginated properties */
export async function getPortalListing(slug, filters = {}) {
  const tenant = await findActiveTenant(slug);

  const query = {
    tenantId:          tenant._id,
    publishedOnPortal: true,
    status:            'available',
  };

  if (filters.operation) query.operation = filters.operation;
  if (filters.type)      query.type      = filters.type;
  if (filters.zone)      query.$or = [
    { zone:    new RegExp(escapeRegex(filters.zone), 'i') },
    { address: new RegExp(escapeRegex(filters.zone), 'i') },
    { title:   new RegExp(escapeRegex(filters.zone), 'i') },
  ];
  if (filters.minPrice || filters.maxPrice) {
    query.price = {};
    if (filters.minPrice) query.price.$gte = Number(filters.minPrice);
    if (filters.maxPrice) query.price.$lte = Number(filters.maxPrice);
  }
  if (filters.beds)  query.beds  = { $gte: Number(filters.beds) };
  if (filters.baths) query.baths = { $gte: Number(filters.baths) };

  // Sorting
  const SORTS = {
    recent:     { createdAt: -1 },
    price_asc:  { price: 1 },
    price_desc: { price: -1 },
  };
  const sort = SORTS[filters.sort] || SORTS.recent;

  const page  = Math.max(1, Number(filters.page) || 1);
  const skip  = (page - 1) * MAX_PROPERTIES_PER_PAGE;

  const [properties, total] = await Promise.all([
    Property.find(query)
      .select(PUBLIC_PROPERTY_FIELDS.join(' '))
      .sort(sort)
      .skip(skip)
      .limit(MAX_PROPERTIES_PER_PAGE),
    Property.countDocuments(query),
  ]);

  // Distinct zones for the filter dropdown (so the agency's barrios appear).
  const zones = await Property.distinct('zone', {
    tenantId: tenant._id, publishedOnPortal: true, status: 'available', zone: { $nin: [null, ''] },
  });

  return {
    portal: buildPortalPublicConfig(tenant),
    properties,
    zones: zones.sort(),
    pagination: { page, total, pages: Math.ceil(total / MAX_PROPERTIES_PER_PAGE) },
  };
}


/** Return a single property detail */
export async function getPropertyDetail(slug, propertyId) {
  const tenant = await findActiveTenant(slug);
  const property = await Property.findOne({
    _id:               propertyId,
    tenantId:          tenant._id,
    publishedOnPortal: true,
  }).select(PUBLIC_PROPERTY_FIELDS.join(' '));

  if (!property) throw new AppError('Propiedad no encontrada', 404);

  // Similar listings: same operation, prefer same type/zone, exclude this one.
  const baseQuery = {
    tenantId:          tenant._id,
    publishedOnPortal: true,
    status:            'available',
    _id:               { $ne: property._id },
    operation:         property.operation,
  };
  let similar = await Property.find({ ...baseQuery, type: property.type })
    .select(PUBLIC_PROPERTY_FIELDS.join(' ')).sort({ createdAt: -1 }).limit(8);
  if (similar.length < 4) {
    const extra = await Property.find({ ...baseQuery, _id: { $nin: [property._id, ...similar.map(s => s._id)] } })
      .select(PUBLIC_PROPERTY_FIELDS.join(' ')).sort({ createdAt: -1 }).limit(8 - similar.length);
    similar = [...similar, ...extra];
  }

  return { portal: buildPortalPublicConfig(tenant), property, similar };
}

/** Create a lead from a portal contact form */
export async function createPortalLead(slug, contactData) {
  const tenant = await findActiveTenant(slug);

  const { name, phone, email, message, propertyId } = contactData;
  if (!name?.trim()) throw new AppError('El nombre es requerido', 400);
  if (!phone?.trim() && !email?.trim()) throw new AppError('Teléfono o email requerido', 400);

  const intent = message?.trim() || (propertyId ? 'Consulta desde portal' : '');
  const contact = phone?.trim() || email?.trim();

  const lead = await Lead.create({
    tenantId:         tenant._id,
    name:             name.trim(),
    contact,
    source:           'portal',
    intent,
    stage:            'new',
    portalPropertyId: propertyId || null,
  });

  return lead;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRM — portal settings management (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

/** Get current portal config for a tenant */
export async function getPortalConfig(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError('Tenant no encontrado', 404);
  return {
    slug:   tenant.slug || '',
    portal: tenant.portal || {},
  };
}

/** Save / update portal config */
export async function savePortalConfig(tenantId, data) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError('Tenant no encontrado', 404);

  // Accept portal fields either nested under `portal` (current frontend) or
  // at the top level (legacy), so both shapes work.
  const p = data.portal || data;

  // Build and validate slug
  const rawSlug = data.slug?.trim() ? buildSlug(data.slug) : buildSlug(tenant.name);

  // Check slug uniqueness (ignore current tenant)
  const conflict = await Tenant.findOne({ slug: rawSlug, _id: { $ne: tenantId } });
  if (conflict) throw new AppError(`El slug "${rawSlug}" ya está en uso`, 409);

  // Hero images: accept array of URLs, trim + drop empties, cap at 8
  const heroImages = Array.isArray(p.heroImages)
    ? p.heroImages.map(u => (u || '').trim()).filter(Boolean).slice(0, 8)
    : [];

  const seo = p.seo || {};

  // Layout & visibility
  const lay = p.layout || {};
  const CARD_STYLES = ['rounded', 'sharp', 'flat'];
  const BUTTON_STYLES = ['solid', 'outline', 'pill'];
  const DENSITIES = ['compact', 'comfortable', 'spacious'];
  const HERO_LAYOUTS = ['centered', 'left', 'solid'];
  const HEADERS = ['solid', 'transparent'];
  const layout = {
    cardStyle:   CARD_STYLES.includes(lay.cardStyle) ? lay.cardStyle : 'rounded',
    radius:      clampNumber(lay.radius, 0, 28, 16),
    buttonStyle: BUTTON_STYLES.includes(lay.buttonStyle) ? lay.buttonStyle : 'solid',
    density:     DENSITIES.includes(lay.density) ? lay.density : 'comfortable',
    heroLayout:  HERO_LAYOUTS.includes(lay.heroLayout) ? lay.heroLayout : 'centered',
    header:      HEADERS.includes(lay.header) ? lay.header : 'solid',
    sectionOrder: sanitizeSectionOrder(lay.sectionOrder),
    darkMode:    Boolean(lay.darkMode),
    showStats:   lay.showStats   !== false,
    showContact: lay.showContact !== false,
    showMap:     lay.showMap     !== false,
    showSimilar: lay.showSimilar !== false,
  };

  // Extra content sections
  const sec = p.sections || {};
  const soc = sec.social || {};
  const sections = {
    about: (sec.about || '').trim().slice(0, 1500),
    hours: (sec.hours || '').trim().slice(0, 400),
    whyUs: Array.isArray(sec.whyUs)
      ? sec.whyUs.map(s => (s || '').trim()).filter(Boolean).slice(0, 6)
      : [],
    testimonials: Array.isArray(sec.testimonials)
      ? sec.testimonials
          .map(t => ({ name: (t?.name || '').trim().slice(0, 80), text: (t?.text || '').trim().slice(0, 400) }))
          .filter(t => t.text)
          .slice(0, 6)
      : [],
    social: {
      instagram: (soc.instagram || '').trim(),
      facebook:  (soc.facebook  || '').trim(),
      tiktok:    (soc.tiktok    || '').trim(),
      website:   (soc.website   || '').trim(),
    },
  };

  tenant.slug = rawSlug;
  tenant.portal = {
    active:       Boolean(p.active),
    agencyName:   p.agencyName?.trim()   || tenant.name,
    tagline:      p.tagline?.trim()       || '',
    primaryColor:   p.primaryColor?.trim()   || '#6366F1',
    secondaryColor: p.secondaryColor?.trim() || '',
    heroOverlay:    clampNumber(p.heroOverlay, 0, 80, 45),
    whatsapp:     p.whatsapp?.trim()      || '',
    email:        p.email?.trim()         || '',
    logoUrl:      p.logoUrl?.trim()       || '',
    logoEmoji:    p.logoEmoji?.trim()     || '',
    heroFont:     p.heroFont?.trim()      || '',
    heroAnimation:p.heroAnimation?.trim() || '',
    heroImages,
    layout,
    sections,
    seo: {
      metaTitle:       seo.metaTitle?.trim()       || '',
      metaDescription: seo.metaDescription?.trim() || '',
      keywords:        seo.keywords?.trim()        || '',
      allowIndexing:   seo.allowIndexing !== false,
      analyticsId:     seo.analyticsId?.trim()     || '',
      metaPixelId:     seo.metaPixelId?.trim()     || '',
    },
  };

  await tenant.save();
  return { slug: tenant.slug, portal: tenant.portal };
}

/** Toggle publishedOnPortal flag on a property */
export async function togglePropertyPublished(tenantId, propertyId, published) {
  const property = await Property.findOneAndUpdate(
    { _id: propertyId, tenantId },
    { publishedOnPortal: Boolean(published) },
    { new: true },
  );
  if (!property) throw new AppError('Propiedad no encontrada', 404);
  return { _id: property._id, publishedOnPortal: property.publishedOnPortal };
}

// ─────────────────────────────────────────────────────────────────────────────
// "Clonar estilo" — suggest a palette from an example page (no scraping of data,
// only the visual style: dominant brand colours).
// ─────────────────────────────────────────────────────────────────────────────

const CLONE_UA = 'Mozilla/5.0 (compatible; AgentProBot/1.0)';

/** A near-neutral colour (white/black/grey) is not a usable brand colour. */
function isNeutralHex(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max - min;
  return sat < 28 || max < 30 || min > 232; // grey-ish, too dark, or too light
}

/** Darken/lighten a #rrggbb hex by `pct` (-100..100). */
function shadeHex(hex, pct) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * pct);
  const clamp = (n) => Math.max(0, Math.min(255, n));
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0xff) + amt);
  const b = clamp((num & 0xff) + amt);
  return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));
const rgbToHex  = (r, g, b) => '#' + [r, g, b].map(x => clampByte(x).toString(16).padStart(2, '0')).join('');

/** Convert a #rgb shorthand to #rrggbb; pass #rrggbb through. */
function normalizeHex(h) {
  h = h.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h)) return '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h;
}

/** HSL (h 0-360, s/l 0-100) → #rrggbb. */
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** Rank non-neutral brand colours found in markup + CSS (hex, rgb(), hsl()). */
function extractColors(text) {
  const counts = {};
  const add = (raw) => {
    const hex = normalizeHex(raw);
    if (!/^#[0-9a-f]{6}$/.test(hex) || isNeutralHex(hex)) return;
    counts[hex] = (counts[hex] || 0) + 1;
  };
  for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) add(m[0]);
  for (const m of text.matchAll(/#[0-9a-fA-F]{3}\b/g))  add(m[0]);
  for (const m of text.matchAll(/rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})/gi))
    add(rgbToHex(+m[1], +m[2], +m[3]));
  for (const m of text.matchAll(/hsla?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})%\s*[,\s]\s*(\d{1,3})%/gi))
    add(hslToHex(+m[1], +m[2], +m[3]));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([h]) => h);
}

/** Most-used font families declared in the CSS (skipping generic keywords). */
function extractFonts(css) {
  const GENERIC = new Set(['inherit', 'initial', 'unset', 'sans-serif', 'serif', 'monospace',
    'system-ui', '-apple-system', 'blinkmacsystemfont', 'ui-sans-serif', 'ui-serif', 'cursive', 'fantasy']);
  const counts = {};
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{!]+)/gi)) {
    const fam = m[1].split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!fam || GENERIC.has(fam.toLowerCase())) continue;
    counts[fam] = (counts[fam] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([f]) => f).slice(0, 4);
}

/**
 * Fetch an example page (+ its linked CSS) and propose a full style: palette,
 * fonts and logo. SSRF-guarded. Nothing is applied — the CRM previews it first.
 */
export async function suggestStyleFromUrl(url) {
  const target = (url || '').trim();
  if (!target) throw new AppError('Ingresá una URL de ejemplo', 400);
  await assertPublicUrl(target);

  let html = '';
  try {
    const res = await safeFetch(target, { headers: { 'User-Agent': CLONE_UA }, timeoutMs: 15_000 });
    html = await res.text();
  } catch {
    throw new AppError('No pudimos leer esa página. Probá con otra URL.', 422);
  }

  // Collect linked stylesheets (most brand colours live in external CSS).
  let css = '';
  const hrefs = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (href) hrefs.push(href);
  }
  for (const href of hrefs.slice(0, 6)) {
    try {
      const abs = new URL(href, target).toString();
      const r = await safeFetch(abs, { headers: { 'User-Agent': CLONE_UA }, timeoutMs: 10_000 });
      css += (await r.text()).slice(0, 400_000);
      if (css.length > 1_200_000) break;
    } catch { /* skip individual stylesheet */ }
  }
  // Inline <style> blocks too.
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += '\n' + m[1];

  const themeMeta = (html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["'](#[0-9a-fA-F]{3,6})["']/i) || [])[1];

  const ranked = extractColors(html + '\n' + css);
  const primary = (themeMeta && normalizeHex(themeMeta)) || ranked[0];
  if (!primary) throw new AppError('No encontramos colores de marca en esa página. Probá con otra URL.', 422);
  const secondary = ranked.find(h => h !== primary) || shadeHex(primary, -18);
  const accent    = ranked.find(h => h !== primary && h !== secondary) || shadeHex(primary, 22);
  const palette   = [...new Set([primary, secondary, accent, ...ranked])].slice(0, 6);

  const fonts = extractFonts(css);

  // Logo: prefer og:image, fall back to a declared icon.
  const logoRaw = (html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [])[1]
               || (html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i) || [])[1] || '';
  let logo = '';
  try { if (logoRaw) logo = new URL(logoRaw, target).toString(); } catch { /* ignore */ }

  return { primaryColor: primary, secondaryColor: secondary, accentColor: accent, palette, fonts, logo, source: target };
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildPortalPublicConfig(tenant) {
  return {
    agencyName:   tenant.portal?.agencyName   || tenant.name,
    tagline:      tenant.portal?.tagline       || '',
    primaryColor:   tenant.portal?.primaryColor   || '#6366F1',
    secondaryColor: tenant.portal?.secondaryColor || '',
    heroOverlay:    typeof tenant.portal?.heroOverlay === 'number' ? tenant.portal.heroOverlay : 45,
    whatsapp:     tenant.portal?.whatsapp      || '',
    email:        tenant.portal?.email         || '',
    logoUrl:      tenant.portal?.logoUrl       || '',
    logoEmoji:    tenant.portal?.logoEmoji     || '',
    heroFont:     tenant.portal?.heroFont      || '',
    heroAnimation:tenant.portal?.heroAnimation || '',
    heroImages:   tenant.portal?.heroImages    || [],
    layout:       tenant.portal?.layout        || {},
    sections:     tenant.portal?.sections      || {},
    seo:          tenant.portal?.seo           || {},
    slug:         tenant.slug,
  };
}
