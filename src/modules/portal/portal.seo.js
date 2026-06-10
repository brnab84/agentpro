import { Tenant }   from '../../models/Tenant.js';
import { Property } from '../../models/Property.js';

// ─────────────────────────────────────────────────────────────────────────────
// Server-side SEO for the public portal: injects real <title>, meta description,
// Open Graph / Twitter cards and Schema.org JSON-LD into the static HTML shell
// BEFORE sending it, so search engines and social crawlers (which don't run JS)
// see meaningful content and link previews.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OG_IMAGE =
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80';

const TYPE_LABELS = {
  house: 'Casa', apartment: 'Departamento', land: 'Terreno',
  commercial: 'Comercial', office: 'Oficina', warehouse: 'Depósito',
};
const OP_LABELS = { sale: 'En venta', rent: 'En alquiler' };

/** Escape a string for safe insertion into HTML attributes / text. */
function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Only http(s) URLs are valid og:image targets (data: URIs are rejected by crawlers). */
function publicImage(url) {
  return url && /^https?:\/\//i.test(url) ? url : '';
}

/** Validate a GA4 measurement id (G-XXXXXXX). Prevents injecting arbitrary text. */
function gaId(id) {
  return /^G-[A-Z0-9]{4,}$/i.test(id || '') ? id : '';
}

/** Build the Google Analytics (GA4) snippet, or '' when no valid id. */
function gaSnippet(id) {
  const g = gaId(id);
  if (!g) return '';
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${g}"></script>\n  ` +
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
    `gtag('js',new Date());gtag('config','${g}');</script>`;
}

/** Build the block of SEO tags injected into <head>. */
function buildHeadTags({ url, image, robots, jsonLd, keywords, analyticsId }) {
  const img = publicImage(image) || DEFAULT_OG_IMAGE;
  const tags = [
    `<meta name="robots" content="${robots}"/>`,
    `<link rel="canonical" href="${esc(url)}"/>`,
    keywords ? `<meta name="keywords" content="${esc(keywords)}"/>` : '',
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:url" content="${esc(url)}"/>`,
    `<meta property="og:image" content="${esc(img)}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:image" content="${esc(img)}"/>`,
  ].filter(Boolean);
  if (jsonLd) tags.push(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);
  const ga = gaSnippet(analyticsId);
  if (ga) tags.push(ga);
  return tags.join('\n  ');
}

/** Replace the SEO placeholders in a template (no regex → safe with special chars). */
function inject(template, { title, description, headTags, ogTitle, ogDesc }) {
  return template
    .split('__SEO_TITLE__').join(esc(title))
    .split('__SEO_DESC__').join(esc(description))
    .split('__SEO_OG_TITLE__').join(esc(ogTitle ?? title))
    .split('__SEO_OG_DESC__').join(esc(ogDesc ?? description))
    .split('<!--SEO_HEAD-->').join(headTags);
}

function clamp(text, max) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function formatPrice(price, currency) {
  if (!price) return 'Consultar precio';
  const sym = currency === 'ARS' ? '$' : 'USD';
  return `${sym} ${Number(price).toLocaleString('es')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public renderers
// ─────────────────────────────────────────────────────────────────────────────

/** Render the listing page HTML with portal-specific SEO. */
export async function renderListingHtml(slug, baseUrl, template) {
  const tenant = await Tenant.findOne({ slug });
  if (!tenant) return inject(template, fallbackMeta(baseUrl));

  const p = tenant.portal || {};
  const indexable = p.active !== false && p.seo?.allowIndexing !== false;
  const url = `${baseUrl}/portal/${slug}`;

  const title = p.seo?.metaTitle?.trim()
    || `${p.agencyName || tenant.name} — Propiedades en venta y alquiler`;
  const description = p.seo?.metaDescription?.trim()
    || clamp(p.tagline || `Mirá las propiedades disponibles de ${p.agencyName || tenant.name}. Casas, departamentos y terrenos en venta y alquiler.`, 160);
  const image = publicImage((p.heroImages || []).find(publicImage)) || DEFAULT_OG_IMAGE;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: p.agencyName || tenant.name,
    url,
    image,
    ...(p.email ? { email: p.email } : {}),
    ...(p.whatsapp ? { telephone: p.whatsapp } : {}),
  };

  const headTags = buildHeadTags({
    url, image,
    robots: indexable ? 'index, follow' : 'noindex, nofollow',
    keywords: p.seo?.keywords,
    analyticsId: p.seo?.analyticsId,
    jsonLd,
  });

  return inject(template, { title, description, headTags });
}

/** Render a single-property page HTML with property-specific SEO. */
export async function renderPropertyHtml(slug, propertyId, baseUrl, template) {
  const tenant = await Tenant.findOne({ slug });
  if (!tenant) return inject(template, fallbackMeta(baseUrl));

  const p = tenant.portal || {};
  let property = null;
  try {
    property = await Property.findOne({
      _id: propertyId, tenantId: tenant._id, publishedOnPortal: true,
    });
  } catch { /* invalid id */ }

  if (!property) return inject(template, fallbackMeta(baseUrl, p.agencyName || tenant.name));

  const indexable = p.active !== false && p.seo?.allowIndexing !== false;
  const url = `${baseUrl}/portal/${slug}/propiedad/${propertyId}`;
  const opLabel = OP_LABELS[property.operation] || '';
  const typeLabel = TYPE_LABELS[property.type] || '';
  const priceStr = formatPrice(property.price, property.currency);

  const title = `${property.title} — ${priceStr} | ${p.agencyName || tenant.name}`;
  const descParts = [
    `${typeLabel} ${opLabel}`.trim(),
    [property.address, property.zone].filter(Boolean).join(', '),
    priceStr,
    property.description,
  ].filter(Boolean);
  const description = clamp(descParts.join('. '), 160);
  const image = publicImage((property.photos || []).find(publicImage));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: property.title,
    description: clamp(property.description || description, 300),
    ...(image ? { image: (property.photos || []).filter(publicImage).slice(0, 6) } : {}),
    category: typeLabel,
    ...(property.price ? {
      offers: {
        '@type': 'Offer',
        price: property.price,
        priceCurrency: property.currency || 'USD',
        availability: property.status === 'available'
          ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
        url,
      },
    } : {}),
    ...((property.address || property.zone) ? {
      areaServed: [property.address, property.zone].filter(Boolean).join(', '),
    } : {}),
  };

  const headTags = buildHeadTags({
    url, image,
    robots: indexable ? 'index, follow' : 'noindex, nofollow',
    keywords: p.seo?.keywords,
    analyticsId: p.seo?.analyticsId,
    jsonLd,
  });

  return inject(template, { title, description, headTags });
}

function fallbackMeta(baseUrl, agency = 'Portal de propiedades') {
  return {
    title: agency,
    description: 'Propiedades en venta y alquiler.',
    headTags: buildHeadTags({ url: baseUrl, image: DEFAULT_OG_IMAGE, robots: 'noindex, follow' }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// robots.txt + sitemap.xml
// ─────────────────────────────────────────────────────────────────────────────

export function buildRobotsTxt(baseUrl) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

/** Sitemap with all active, indexable portals and their published properties. */
export async function buildSitemap(baseUrl) {
  const tenants = await Tenant.find({
    slug: { $exists: true, $ne: '' },
    'portal.active': true,
  }).select('slug portal.seo.allowIndexing');

  const urls = [`${baseUrl}/landing`];

  for (const t of tenants) {
    if (t.portal?.seo?.allowIndexing === false) continue;
    urls.push(`${baseUrl}/portal/${t.slug}`);
    const props = await Property.find({
      tenantId: t._id, publishedOnPortal: true, status: 'available',
    }).select('_id updatedAt');
    for (const pr of props) {
      urls.push({
        loc: `${baseUrl}/portal/${t.slug}/propiedad/${pr._id}`,
        lastmod: pr.updatedAt?.toISOString?.().slice(0, 10),
      });
    }
  }

  const body = urls.map(u => {
    const loc = typeof u === 'string' ? u : u.loc;
    const lastmod = typeof u === 'object' && u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '';
    return `  <url>\n    <loc>${esc(loc)}</loc>${lastmod}\n  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
