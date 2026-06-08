// Next-best-action por reglas, según etapa y señales del lead.

export function nextBestAction(lead, topMatches = []) {
  if (lead.stage === 'closed') return 'Lead cerrado. Solicitar referidos.';
  if (lead.stage === 'lost') return 'Lead perdido. Reactivar en 60 días con nueva oferta.';

  if (lead.stage === 'new') {
    if (!lead.budget) return 'Contactar para confirmar presupuesto y zona de interés.';
    return 'Calificar: confirmar urgencia y enviar primeras opciones.';
  }

  if (lead.stage === 'qualified') {
    if (topMatches.length > 0) {
      const titles = topMatches
        .slice(0, 3)
        .map((m) => m.property.title)
        .join(', ');
      return `Enviar ${topMatches.length} propiedades match: ${titles}. Proponer visita.`;
    }
    return 'Buscar/cargar propiedades que encajen y proponer visita.';
  }

  if (lead.stage === 'visit') {
    return 'Confirmar visita y preparar propuesta de cierre.';
  }

  return 'Dar seguimiento.';
}
