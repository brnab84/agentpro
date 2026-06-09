import { Lead } from '../../models/Lead.js';
import { Appointment } from '../../models/Appointment.js';
import { FunnelExecution } from '../../models/FunnelExecution.js';
import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';

/**
 * Generates AI-powered actionable suggestions for the agent's dashboard.
 * Falls back to rule-based suggestions if the AI call fails.
 */
export async function getDashboardSuggestions(tenantId) {
  const now = new Date();
  const today = now.toDateString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);

  const [leads, appts, executions] = await Promise.all([
    Lead.find({ tenantId }).sort({ updatedAt: -1 }).lean(),
    Appointment.find({ tenantId }).populate('leadId', 'name').lean(),
    FunnelExecution.find({ tenantId, status: 'running' })
      .populate('leadId', 'name contact')
      .populate('funnelId', 'name')
      .lean(),
  ]);

  // ── Rule-based data extraction ──────────────────────────────────────────────
  const todayAppts = appts.filter(a => new Date(a.datetime).toDateString() === today && a.status !== 'cancelled');
  const overdueAppts = appts.filter(a => new Date(a.datetime) < now && a.status === 'scheduled');

  // Leads sin contacto reciente (más de 7 días sin actualización)
  const staleLeads = leads.filter(l =>
    ['new', 'qualified', 'visit'].includes(l.stage) &&
    new Date(l.updatedAt) < sevenDaysAgo
  ).slice(0, 5);

  // Leads de alto score sin cita agendada
  const hotLeadsNoCita = leads.filter(l => {
    if (l.score < 70 || l.stage === 'closed' || l.stage === 'lost') return false;
    return !appts.some(a => String(a.leadId?._id || a.leadId) === String(l._id) && a.status === 'scheduled');
  }).sort((a, b) => b.score - a.score).slice(0, 3);

  // Leads en visita sin cierre (más de 3 días)
  const visitStuck = leads.filter(l =>
    l.stage === 'visit' && new Date(l.updatedAt) < threeDaysAgo
  ).slice(0, 3);

  // ── Try AI-powered suggestions ──────────────────────────────────────────────
  try {
    const client = getAnthropic();
    const ctx = JSON.stringify({
      hoy: today,
      citasHoy: todayAppts.map(a => ({ lead: a.leadId?.name, hora: new Date(a.datetime).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) })),
      citasVencidas: overdueAppts.length,
      leadsInactivos: staleLeads.map(l => ({ nombre: l.name, stage: l.stage, diasSinActividad: Math.round((now - new Date(l.updatedAt)) / 86400000), score: l.score })),
      leadsCalienteSinCita: hotLeadsNoCita.map(l => ({ nombre: l.name, score: l.score, stage: l.stage })),
      leadsEnVisitaEstancados: visitStuck.map(l => ({ nombre: l.name, diasEnVisita: Math.round((now - new Date(l.updatedAt)) / 86400000) })),
      funnelsActivos: executions.length,
    });

    const response = await client.messages.create({
      model: env.aiModel,
      max_tokens: 800,
      system: `Eres un coach de ventas inmobiliarias. Analizás el estado del CRM de un agente y generás entre 3 y 5 sugerencias concretas y accionables para hoy.
Respondes ÚNICAMENTE con un JSON array, sin markdown ni texto adicional.
Cada item: { "prioridad": "alta"|"media"|"baja", "tipo": "seguimiento"|"cita"|"cierre"|"pipeline"|"alerta", "titulo": string corto, "descripcion": string de 1-2 oraciones accionables, "leadNombre": string|null }
Sé específico con nombres de leads cuando los tengas. No repitas ideas. Priorizá por impacto en ventas.`,
      messages: [{ role: 'user', content: `Estado del CRM de hoy:\n${ctx}` }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = text.replace(/```json|```/g, '').trim();
    const suggestions = JSON.parse(cleaned);
    if (Array.isArray(suggestions) && suggestions.length) return suggestions.slice(0, 6);
  } catch (e) {
    console.warn('AI suggestions fallback:', e.message);
  }

  // ── Rule-based fallback ─────────────────────────────────────────────────────
  const fallback = [];

  if (todayAppts.length > 0) {
    fallback.push({
      prioridad: 'alta', tipo: 'cita',
      titulo: `${todayAppts.length} cita${todayAppts.length > 1 ? 's' : ''} hoy`,
      descripcion: `Tenés ${todayAppts.length} cita${todayAppts.length > 1 ? 's' : ''} programada${todayAppts.length > 1 ? 's' : ''} para hoy. Confirmá con los clientes antes de la reunión.`,
      leadNombre: todayAppts[0]?.leadId?.name || null,
    });
  }

  if (overdueAppts.length > 0) {
    fallback.push({
      prioridad: 'alta', tipo: 'alerta',
      titulo: `${overdueAppts.length} cita${overdueAppts.length > 1 ? 's' : ''} vencida${overdueAppts.length > 1 ? 's' : ''}`,
      descripcion: `Hay citas que pasaron sin marcarse como realizadas. Actualizá su estado en la agenda.`,
      leadNombre: null,
    });
  }

  hotLeadsNoCita.slice(0, 2).forEach(l => {
    fallback.push({
      prioridad: 'alta', tipo: 'cita',
      titulo: `Agendar cita con ${l.name}`,
      descripcion: `Score ${l.score}/100. Este lead tiene alta probabilidad de cierre pero no tiene cita agendada.`,
      leadNombre: l.name,
    });
  });

  staleLeads.slice(0, 2).forEach(l => {
    const dias = Math.round((now - new Date(l.updatedAt)) / 86400000);
    fallback.push({
      prioridad: 'media', tipo: 'seguimiento',
      titulo: `Retomar contacto con ${l.name}`,
      descripcion: `Sin actividad hace ${dias} días. Enviá un mensaje de seguimiento para mantener el interés.`,
      leadNombre: l.name,
    });
  });

  visitStuck.forEach(l => {
    const dias = Math.round((now - new Date(l.updatedAt)) / 86400000);
    fallback.push({
      prioridad: 'media', tipo: 'cierre',
      titulo: `Empujar cierre: ${l.name}`,
      descripcion: `Lleva ${dias} días en etapa Visita. Es momento de presentar propuesta formal o identificar objeciones.`,
      leadNombre: l.name,
    });
  });

  if (!fallback.length) {
    fallback.push({
      prioridad: 'baja', tipo: 'pipeline',
      titulo: 'Pipeline al día',
      descripcion: 'No hay alertas urgentes. Buen momento para calificar nuevos leads con IA o agregar propiedades al catálogo.',
      leadNombre: null,
    });
  }

  return fallback.slice(0, 6);
}
