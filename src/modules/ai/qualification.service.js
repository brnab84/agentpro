import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

const SYSTEM_PROMPT = `Eres un asistente de calificación de leads inmobiliarios.
Recibes el texto de la conversación con un prospecto y extraes datos estructurados.
Respondes ÚNICAMENTE con un objeto JSON válido, sin markdown, sin texto adicional.

Esquema de salida:
{
  "budget": number | null,        // presupuesto detectado en la moneda mencionada, solo el número
  "intent": string | null,        // resumen breve de qué busca (zona, tipo, recámaras)
  "urgencyDays": number | null,   // en cuántos días quiere mudarse/cerrar, null si no se sabe
  "qualityScore": number,         // 0-100, qué tan calificado y serio parece el lead
  "summary": string               // una frase resumen del prospecto
}

Reglas:
- Si un dato no aparece, usa null (excepto qualityScore y summary).
- qualityScore alto = presupuesto claro + urgencia + intención específica.
- No inventes datos que no estén en el texto.`;

function parseJsonResponse(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AppError('AI returned invalid JSON', 502);
  }
}

export async function qualifyLeadText(conversationText) {
  if (!conversationText || conversationText.trim().length < 3) {
    throw new AppError('conversationText too short', 422);
  }

  const client = getAnthropic();
  const response = await client.messages.create({
    model: env.aiModel,
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: conversationText }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const data = parseJsonResponse(text);

  return {
    budget: typeof data.budget === 'number' ? data.budget : null,
    intent: data.intent || null,
    urgencyDays: typeof data.urgencyDays === 'number' ? data.urgencyDays : null,
    qualityScore: clamp(data.qualityScore, 0, 100),
    summary: data.summary || '',
  };
}

function clamp(n, min, max) {
  const v = Number(n);
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}
