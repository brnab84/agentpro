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
  const layout = {
    cardStyle:   CARD_STYLES.includes(lay.cardStyle) ? lay.cardStyle : 'rounded',
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

/**
 * Fetch an example page and propose a primary/secondary colour from its CSS.
 * SSRF-guarded. Returns suggested colours for the user to review (not auto-applied).
 */
export async function suggestStyleFromUrl(url) {
  const target = (url || '').trim();
  if (!target) throw new AppError('Ingresá una URL de ejemplo', 400);
  await assertPublicUrl(target);

  let html = '';
  try {
    const res = await safeFetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentProBot/1.0)' },
      timeoutMs: 15_000,
    });
    html = await res.text();
  } catch {
    throw new AppError('No pudimos leer esa página. Probá con otra URL.', 422);
  }

  // Prefer the brand <meta name="theme-color"> when present.
  const themeMeta = html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["'](#[0-9a-fA-F]{6})["']/i)
                 || html.match(/<meta[^>]+content=["'](#[0-9a-fA-F]{6})["'][^>]*name=["']theme-color["']/i);

  // Count hex colours across the markup/CSS, ignoring neutrals.
  const counts = {};
  for (const m of html.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = '#' + m[1].toLowerCase();
    if (isNeutralHex(hex)) continue;
    counts[hex] = (counts[hex] || 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([h]) => h);

  const primary = (themeMeta && themeMeta[1].toLowerCase()) || ranked[0];
  if (!primary) throw new AppError('No encontramos colores de marca en esa página.', 422);

  // Secondary: the next distinct strong colour, else a darker shade of primary.
  const secondary = ranked.find(h => h !== primary) || shadeHex(primary, -18);

  return { primaryColor: primary, secondaryColor: secondary, source: target };
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
