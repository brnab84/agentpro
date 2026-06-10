import { readFileSync } from 'fs';
import { join } from 'path';
import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

// Help assistant: answers user questions about how to use AgentPro, grounded in
// the knowledge base markdown (loaded once and cached).
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

const MAX_HISTORY = 10;

function buildSystemPrompt() {
  return `Sos el asistente de ayuda de AgentPro, un CRM inmobiliario. Tu trabajo es ayudar al usuario a usar la aplicación, con calidez y de forma concreta.

Reglas:
- Respondé SIEMPRE en español rioplatense, amable y cercano (como si lo acompañaras).
- Basate ÚNICAMENTE en la GUÍA de abajo. No inventes funciones que no figuran.
- Si la pregunta no está cubierta por la guía, decilo con honestidad y sugerí dónde podría estar o que contacte al soporte. No inventes.
- Cuando expliques cómo hacer algo, da pasos cortos y numerados, mencionando el nombre exacto de los botones/secciones.
- Sé breve: 2 a 6 oraciones o una lista corta. Nada de respuestas larguísimas.
- No pidas ni manejes contraseñas, tarjetas ni datos sensibles.

=== GUÍA DE AGENTPRO ===
${knowledgeBase()}
=== FIN DE LA GUÍA ===`;
}

/** Answer a help question given the recent conversation. */
export async function ask(messages = []) {
  if (!env.anthropicApiKey) {
    throw new AppError('El asistente no está disponible (falta configurar la IA).', 503);
  }
  const history = (Array.isArray(messages) ? messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!history.length || history[history.length - 1].role !== 'user') {
    throw new AppError('Falta la pregunta del usuario', 400);
  }

  const client = getAnthropic();
  const response = await client.messages.create({
    model: env.aiModel,
    max_tokens: 500,
    system: buildSystemPrompt(),
    messages: history,
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  return { reply: text || 'No estoy seguro de eso. ¿Podés reformular la pregunta?' };
}
