// Matching lead <-> propiedad por similitud de atributos.
// Sin embeddings externos: puntúa zona, presupuesto y tipo.

function budgetFit(leadBudget, price) {
  if (!leadBudget || !price) return 0.3;
  const ratio = price / leadBudget;
  if (ratio <= 1) return 1; // dentro de presupuesto
  if (ratio <= 1.1) return 0.7; // hasta 10% arriba
  if (ratio <= 1.25) return 0.4;
  return 0.05;
}

function zoneFit(intent, zone) {
  if (!intent || !zone) return 0.3;
  return intent.toLowerCase().includes(zone.toLowerCase()) ? 1 : 0.2;
}

function typeFit(intent, type) {
  if (!intent || !type) return 0.5;
  const map = {
    house: ['casa', 'house', 'chalet'],
    apartment: ['departamento', 'depto', 'apartamento', 'apartment', 'piso'],
    land: ['terreno', 'lote', 'land'],
    commercial: ['local', 'oficina', 'comercial', 'commercial'],
  };
  const kws = map[type] || [];
  const lower = intent.toLowerCase();
  return kws.some((k) => lower.includes(k)) ? 1 : 0.4;
}

export function matchProperties(lead, properties, limit = 3) {
  const scored = properties
    .filter((p) => p.status === 'available')
    .map((p) => {
      const fit =
        0.45 * budgetFit(lead.budget, p.price) +
        0.35 * zoneFit(lead.intent, p.zone) +
        0.2 * typeFit(lead.intent, p.type);
      return { property: p, matchScore: Math.round(fit * 100) };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  return scored.slice(0, limit);
}
