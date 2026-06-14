import { readFileSync } from 'fs';
import { join } from 'path';
import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { Lead } from '../../models/Lead.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import * as leadsService from '../leads/leads.service.js';

// Help assistant: answers user questions about how to use AgentPro, grounded in
// the knowledge base markdown (loaded once and cached), and can take actions on
// the user's leads via tool use (function calling).
let _kb = null;
function knowledgeBase() {
  if (_kb !== null) return _kb;
  try {
    _kb = readFileSync(join(process.cwd(), 'docs', 'AYUDA-CRM.md'), 'utf-8');
  } catch {
    _kb = 'Guía no disponible.';
  }
  return _kb;
}

const MAX_HISTORY = 12;
const MAX_TOOL_ROUNDS = 5;
const LEAD_STAGES = ['new', 'qualified', 'visit', 'closed', 'lost'];
const STAGE_ES = { new: 'nuevo', qualified: 'calificado', visit: 'visita', closed: 'cerrado', lost: 'perdido' };

function buildSystemPrompt() {
  return `Sos el asistente de AgentPro, un CRM inmobiliario. Ayudás al usuario a usar la app y además podés EJECUTAR acciones sobre sus leads usando las herramientas disponibles.

Reglas generales:
- Respondé SIEMPRE en español rioplatense, amable y concreto.
- Para preguntas de "cómo se usa", basate ÚNICAMENTE en la GUÍA de abajo; no inventes funciones.
- Sé breve (2 a 6 oraciones o una lista corta).
- Nunca pidas ni manejes contraseñas, tarjetas ni datos sensibles.

Acciones (herramientas):
- Podés crear leads (create_lead), buscarlos (search_leads) y cambiarles la etapa (update_lead_stage).
- ANTES de crear o modificar algo, CONFIRMÁ con el usuario mostrando los datos exactos (ej: "Voy a crear el lead Juan Pérez, tel 3001234567. ¿Confirmás?"). Recién cuando responda que sí, llamá a la herramienta.
- Para buscar (search_leads) NO hace falta confirmar.
- Si faltan datos obligatorios (el nombre para crear un lead), pedilos antes.
- Las etapas válidas son: nuevo (new), calificado (qualified), visita (visit), cerrado (closed), perdido (lost).
- Después de ejecutar una acción, confirmá en lenguaje natural lo que hiciste.

=== GUÍA DE AGENTPRO ===
${knowledgeBase()}
=== FIN DE LA GUÍA ===`;
}

const TOOLS = [
  {
    name: 'create_lead',
    description: 'Crea un nuevo lead (contacto/prospecto) en el CRM del usuario. Confirmá con el usuario antes de llamar a esta herramienta.',
    input_schema: {
      type: 'object',
      properties: {
        name:    { type: 'string', description: 'Nombre del lead (obligatorio)' },
        contact: { type: 'string', description: 'Teléfono, WhatsApp o email de contacto' },
        intent:  { type: 'string', description: 'Qué busca / nota breve (ej: "alquiler 2 amb en Cali")' },
        budget:  { type: 'number', description: 'Presupuesto en números, si lo menciona' },
        stage:   { type: 'string', enum: LEAD_STAGES, description: 'Etapa inicial; por defecto "new"' },
      },
      required: ['name'],
    },
  },
  {
    name: 'search_leads',
    description: 'Busca leads por nombre/contacto y/o etapa. No requiere confirmación.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar en nombre o contacto' },
        stage: { type: 'string', enum: LEAD_STAGES, description: 'Filtrar por etapa' },
      },
    },
  },
  {
    name: 'update_lead_stage',
    description: 'Cambia la etapa de un lead existente. Necesitás el lead_id (obtenelo antes con search_leads). Confirmá antes de llamar.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'ID del lead a actualizar' },
        stage:   { type: 'string', enum: LEAD_STAGES, description: 'Nueva etapa' },
      },
      required: ['lead_id', 'stage'],
    },
  },
];

/** Execute a tool call scoped to the authenticated tenant. Never trusts ids from text for scoping. */
async function executeTool(name, input, ctx) {
  const { tenantId } = ctx;
  if (name === 'create_lead') {
    if (!input?.name?.trim()) return { error: 'Falta el nombre del lead' };
    const lead = await leadsService.create(tenantId, {
      name: input.name.trim(),
      contact: (input.contact || '').toString().trim(),
      intent: (input.intent || '').toString().trim(),
      budget: Number.isFinite(Number(input.budget)) ? Number(input.budget) : undefined,
      stage: LEAD_STAGES.includes(input.stage) ? input.stage : 'new',
      source: 'manual',
    });
    ctx.changed = true;
    return { ok: true, id: String(lead._id), name: lead.name, stage: lead.stage };
  }

  if (name === 'search_leads') {
    const query = { tenantId };
    if (LEAD_STAGES.includes(input?.stage)) query.stage = input.stage;
    if (input?.query?.trim()) {
      const rx = new RegExp(escapeRegex(input.query.trim()), 'i');
      query.$or = [{ name: rx }, { contact: rx }];
    }
    const leads = await Lead.find(query).sort({ createdAt: -1 }).limit(10)
      .select('name contact stage budget intent');
    return {
      count: leads.length,
      leads: leads.map(l => ({ id: String(l._id), name: l.name, contact: l.contact || '', stage: l.stage, budget: l.budget || 0, intent: l.intent || '' })),
    };
  }

  if (name === 'update_lead_stage') {
    if (!LEAD_STAGES.includes(input?.stage)) return { error: 'Etapa inválida' };
    try {
      const lead = await leadsService.update(tenantId, input.lead_id, { stage: input.stage });
      ctx.changed = true;
      return { ok: true, id: String(lead._id), name: lead.name, stage: lead.stage };
    } catch {
      return { error: 'No encontré ese lead en tu cuenta' };
    }
  }

  return { error: 'Herramienta desconocida' };
}

const textOf = (resp) => resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();

/** Answer a help question and optionally act on leads, given the recent conversation. */
export async function ask(messages = [], ctx = {}) {
  if (!env.anthropicApiKey) {
    throw new AppError('El asistente no está disponible (falta configurar la IA).', 503);
  }
  if (!ctx.tenantId) throw new AppError('Sesión inválida', 401);

  const history = (Array.isArray(messages) ? messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!history.length || history[history.length - 1].role !== 'user') {
    throw new AppError('Falta la pregunta del usuario', 400);
  }

  const client = getAnthropic();
  const system = buildSystemPrompt();
  const msgs = [...history];
  const toolCtx = { tenantId: ctx.tenantId, changed: false };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: env.aiModel,
      max_tokens: 700,
      system,
      tools: TOOLS,
      messages: msgs,
    });

    if (response.stop_reason !== 'tool_use') {
      return { reply: textOf(response) || 'No estoy seguro de eso. ¿Podés reformular?', changed: toolCtx.changed };
    }

    // Run the requested tools and feed the results back to the model.
    msgs.push({ role: 'assistant', content: response.content });
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      let result;
      try {
        result = await executeTool(block.name, block.input || {}, toolCtx);
      } catch (err) {
        result = { error: err.message };
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    msgs.push({ role: 'user', content: toolResults });
  }

  return { reply: 'Listo, hice lo que pude. ¿Necesitás algo más?', changed: toolCtx.changed };
}

export { LEAD_STAGES, STAGE_ES };
