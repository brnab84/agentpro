import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

const SYSTEM_PROMPT = `Eres un asistente inmobiliario virtual para una agencia.
Eres amable, profesional y conciso. Tu objetivo es calificar al prospecto (entender qué busca, su presupuesto y urgencia)
y agendar una cita con un agente.

Reglas:
- Responde en el mismo idioma que el usuario (español o inglés).
- Haz máximo UNA pregunta por mensaje.
- Si ya tienes presupuesto, zona e intención, ofrece agendar una cita.
- Nunca inventes propiedades o precios específicos.
- Respuestas cortas (máximo 3 oraciones).`;

export async function generateChatbotReply(conversationHistory, incomingMessage) {
  const client = getAnthropic();

  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: incomingMessage },
  ];

  const response = await client.messages.create({
    model: env.aiModel,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages,
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  if (!text) throw new AppError('Empty chatbot response', 502);
  return text.trim();
}
