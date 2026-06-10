import { Tenant } from '../../models/Tenant.js';
import { Lead }   from '../../models/Lead.js';

// Meta Lead Ads → CRM. When someone submits a lead form on Facebook/Instagram,
// Meta calls our webhook with a leadgen_id; we fetch the full lead via Graph API
// (using the tenant's Page token) and create a CRM lead.
const GRAPH = 'https://graph.facebook.com/v21.0';

/** Extract leadgen events from a Meta webhook payload. */
export function parseLeadgenWebhook(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change.field === 'leadgen' && change.value?.leadgen_id) {
        out.push({
          leadgenId: change.value.leadgen_id,
          pageId:    change.value.page_id || entry.id,
          formId:    change.value.form_id,
          createdAt: change.value.created_time,
        });
      }
    }
  }
  return out;
}

/** Find the tenant that owns a given Facebook Page id. */
export function resolveTenantByPageId(pageId) {
  return Tenant.findOne({ 'leadAds.pageId': String(pageId) });
}

/** Fetch a lead's field data from the Graph API. */
async function fetchLeadData(leadgenId, pageToken) {
  const res = await fetch(`${GRAPH}/${leadgenId}?access_token=${encodeURIComponent(pageToken)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo leer el lead de Meta');
  return data;
}

/** Map Meta field_data into { name, email, phone }. */
function mapFields(fieldData = []) {
  const get = (names) => {
    const f = fieldData.find(x => names.includes((x.name || '').toLowerCase()));
    return f?.values?.[0] || '';
  };
  const name  = get(['full_name', 'name', 'nombre', 'first_name']);
  const email = get(['email', 'correo']);
  const phone = get(['phone_number', 'phone', 'telefono', 'teléfono', 'celular']);
  return { name, email, phone };
}

/** Process one leadgen event → create a CRM lead. */
export async function processLeadgen({ leadgenId, pageId }) {
  const tenant = await resolveTenantByPageId(pageId);
  if (!tenant?.leadAds?.pageToken) return null;

  const raw = await fetchLeadData(leadgenId, tenant.leadAds.pageToken);
  const { name, email, phone } = mapFields(raw.field_data);

  const lead = await Lead.create({
    tenantId: tenant._id,
    name: name || 'Lead de Meta Ads',
    contact: phone || email || '',
    source: 'meta_ads',
    intent: 'Formulario de anuncio (Facebook/Instagram)',
    stage: 'new',
  });
  return lead;
}
