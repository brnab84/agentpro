import { Tenant }   from '../../models/Tenant.js';
import { Property } from '../../models/Property.js';
import { Lead }     from '../../models/Lead.js';
import { AppError } from '../../utils/AppError.js';

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
  if (filters.zone)      query.zone      = new RegExp(filters.zone, 'i');
  if (filters.minPrice || filters.maxPrice) {
    query.price = {};
    if (filters.minPrice) query.price.$gte = Number(filters.minPrice);
    if (filters.maxPrice) query.price.$lte = Number(filters.maxPrice);
  }

  const page  = Math.max(1, Number(filters.page) || 1);
  const skip  = (page - 1) * MAX_PROPERTIES_PER_PAGE;

  const [properties, total] = await Promise.all([
    Property.find(query)
      .select(PUBLIC_PROPERTY_FIELDS.join(' '))
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(MAX_PROPERTIES_PER_PAGE),
    Property.countDocuments(query),
  ]);

  return {
    portal: buildPortalPublicConfig(tenant),
    properties,
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
  return { portal: buildPortalPublicConfig(tenant), property };
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

  tenant.slug = rawSlug;
  tenant.portal = {
    active:       Boolean(p.active),
    agencyName:   p.agencyName?.trim()   || tenant.name,
    tagline:      p.tagline?.trim()       || '',
    primaryColor: p.primaryColor?.trim()  || '#6366F1',
    whatsapp:     p.whatsapp?.trim()      || '',
    email:        p.email?.trim()         || '',
    logoUrl:      p.logoUrl?.trim()       || '',
    heroImages,
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
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildPortalPublicConfig(tenant) {
  return {
    agencyName:   tenant.portal?.agencyName   || tenant.name,
    tagline:      tenant.portal?.tagline       || '',
    primaryColor: tenant.portal?.primaryColor  || '#6366F1',
    whatsapp:     tenant.portal?.whatsapp      || '',
    email:        tenant.portal?.email         || '',
    logoUrl:      tenant.portal?.logoUrl       || '',
    heroImages:   tenant.portal?.heroImages    || [],
    slug:         tenant.slug,
  };
}
