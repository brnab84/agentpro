import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';
import { Tenant }   from '../../models/Tenant.js';
import { Property } from '../../models/Property.js';
import { Lead }     from '../../models/Lead.js';
import { AppError } from '../../utils/AppError.js';

// Public per-portal AI assistant. Each agency gets its OWN context, built live
// from ITS published properties — nothing is shared between tenants, and it does
// NOT use the CRM help knowledge base. It recommends only real, available
// listings and captures interested visitors as classified leads.

const TYPE_LABELS = { house:'Casa', apartment:'Departamento', land:'Terreno', commercial:'Comercial', office:'Oficina', warehouse:'Depósito' };
const OP_LABELS   = { sale:'Venta', rent:'Alquiler' };
const MAX_CONTEXT_PROPS = 60;
const MAX_HISTORY = 12;

async function resolveActiveTenant(slug) {
  const tenant = await Tenant.findOne({ slug });
  if (!tenant) throw new AppError('Portal no encontrado', 404);
  if (!tenant.portal?.active) throw new AppError('Este portal no está disponible', 404);
  return tenant;
}

/** Compact, per-portal property context (only that agency's published listings). */
async function buildPropertyContext(tenantId) {
  const props = await Property.find({ tenantId, publishedOnPortal: true, status: 'available' })
    .select('title type operation zone address price currency beds baths area')
    .sort({ createdAt: -1 })
    .limit(MAX_CONTEXT_PROPS)
    .lean();

  if (!props.length) return { count: 0, text: '(La agencia todavía no tiene propiedades publicadas.)' };

  const text = props.map((p, i) => {
    const parts = [
      `${i + 1}. [id:${p._id}]`,
      p.title,
      `— ${OP_LABELS[p.operation] || p.operation}`,
      `${TYPE_LABELS[p.type] || p.type}`,
      p.zone ? `en ${p.zone}` : '',
      p.price ? `· ${p.currency || 'USD'} ${Number(p.price).toLocaleString('es')}` : '· precio a consultar',
      p.beds ? `· ${p.beds} amb` : '',
      p.baths ? `· ${p.baths} baño(s)` : '',
      p.area ? `· ${p.area}m²` : '',
    ].filter(Boolean);
    return parts.join(' ');
  }).join('\n');

  return { count: props.length, text };
}

function buildSystemPrompt(agencyName, ctx) {
  return `Sos el asistente virtual de la inmobiliaria "${agencyName}". Atendés a visitantes del portal de propiedades.

Reglas:
- Respondé en español, cálido, breve y útil (2 a 5 oraciones o una lista corta).
- Basate ÚNICAMENTE en las PROPIEDADES DISPONIBLES de abajo. NO inventes propiedades, precios ni datos que no estén en la lista.
- Ayudá a la persona a encontrar la mejor opción según lo que busca (operación, tipo, zona, presupuesto, ambientes).
- Cuando recomiendes una propiedad de la lista, citála SIEMPRE con este formato exacto: [[Título de la propiedad|ID]] (usando el ID que figura entre corchetes [id:...] en la lista). El sistema lo convierte en un enlace clickeable. No muestres el ID crudo ni los corchetes [id:...].
- Si no hay nada que encaje, decilo con sinceridad y ofrecé tomar sus datos para avisarle cuando entre algo.
- Tu objetivo es entender qué busca y conseguir sus datos de contacto para que un asesor lo contacte.

CAPTURA DE LEAD (importante):
- En cuanto tengas el NOMBRE y un TELÉFONO o EMAIL del visitante, agregá al FINAL de tu mensaje, en una sola línea, exactamente este bloque (sin mencionarlo ni explicarlo al usuario):
  [LEAD]{"name":"...","contact":"...","budget":null,"operation":"venta|alquiler|","propertyType":"...","zone":"...","beds":null,"notes":"resumen de lo que busca"}[/LEAD]
- Completá los campos con lo que sepas; usá null o "" si no lo sabés. "budget" y "beds" deben ser números o null.
- Emití el bloque UNA sola vez (cuando ya tengas nombre + contacto). Seguí la charla normal aparte del bloque.

=== PROPIEDADES DISPONIBLES (${ctx.count}) ===
${ctx.text}
=== FIN ===`;
}

function parseLeadBlock(text) {
  const m = text.match(/\[LEAD\]([\s\S]*?)\[\/LEAD\]/i);
  if (!m) return { clean: text, lead: null };
  let lead = null;
  try { lead = JSON.parse(m[1].trim()); } catch { /* ignore malformed */ }
  const clean = text.replace(m[0], '').trim();
  return { clean, lead };
}

async function captureLead(tenant, lead) {
  if (!lead || !lead.name || !lead.contact) return false;
  const bits = [
    lead.operation ? `Operación: ${lead.operation}` : '',
    lead.propertyType ? `Tipo: ${lead.propertyType}` : '',
    lead.zone ? `Zona: ${lead.zone}` : '',
    lead.beds ? `Ambientes: ${lead.beds}` : '',
    lead.budget ? `Presupuesto: ${lead.budget}` : '',
    lead.notes ? lead.notes : '',
  ].filter(Boolean);
  await Lead.create({
    tenantId: tenant._id,
    name:     String(lead.name).slice(0, 120),
    contact:  String(lead.contact).slice(0, 160),
    source:   'portal',
    intent:   bits.join(' · ').slice(0, 500) || 'Consulta desde el asistente del portal',
    budget:   Number(lead.budget) > 0 ? Number(lead.budget) : undefined,
    stage:    'new',
  });
  return true;
}

/** Answer a visitor message; captures a classified lead when contact is shared. */
export async function ask(slug, messages = []) {
  if (!env.anthropicApiKey) throw new AppError('El asistente no está disponible.', 503);
  const tenant = await resolveActiveTenant(slug);

  const history = (Array.isArray(messages) ? messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!history.length || history[history.length - 1].role !== 'user') {
    throw new AppError('Falta el mensaje del visitante', 400);
  }

  const ctx = await buildPropertyContext(tenant._id);
  const client = getAnthropic();
  const response = await client.messages.create({
    model: env.aiModel,
    max_tokens: 500,
    system: buildSystemPrompt(tenant.portal?.agencyName || tenant.name, ctx),
    messages: history,
  });

  const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const { clean, lead } = parseLeadBlock(raw);
  let leadCaptured = false;
  try { leadCaptured = await captureLead(tenant, lead); } catch { /* don't break the chat */ }

  return { reply: clean || '¿En qué puedo ayudarte con nuestras propiedades?', leadCaptured };
}
