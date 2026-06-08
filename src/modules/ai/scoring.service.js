// Modelo de scoring ponderado por señales del lead.
// Devuelve score 0-100 y probabilidad de cierre 0-1.
// Pesos ajustables; en fases futuras se reemplaza por ML sobre histórico real.

const WEIGHTS = {
  hasBudget: 25,
  urgency: 30,
  intentSpecificity: 20,
  sourceQuality: 15,
  qualityScore: 10,
};

const SOURCE_SCORE = {
  whatsapp: 1,
  instagram: 0.8,
  email: 0.7,
  manual: 0.6,
};

function urgencyFactor(urgencyDays) {
  if (urgencyDays == null) return 0;
  if (urgencyDays <= 30) return 1;
  if (urgencyDays <= 90) return 0.6;
  if (urgencyDays <= 180) return 0.3;
  return 0.1;
}

function intentFactor(intent) {
  if (!intent) return 0;
  const len = intent.trim().length;
  if (len > 60) return 1;
  if (len > 25) return 0.6;
  return 0.3;
}

export function computeScore(lead) {
  const budgetF = lead.budget && lead.budget > 0 ? 1 : 0;
  const urgencyF = urgencyFactor(lead.urgencyDays);
  const intentF = intentFactor(lead.intent);
  const sourceF = SOURCE_SCORE[lead.source] ?? 0.5;
  const qualityF = (lead.aiQualityScore ?? 0) / 100;

  const raw =
    WEIGHTS.hasBudget * budgetF +
    WEIGHTS.urgency * urgencyF +
    WEIGHTS.intentSpecificity * intentF +
    WEIGHTS.sourceQuality * sourceF +
    WEIGHTS.qualityScore * qualityF;

  const score = Math.round(Math.max(0, Math.min(100, raw)));
  // Probabilidad de cierre: curva logística suave sobre el score.
  const predictedCloseProb = Number((1 / (1 + Math.exp(-(score - 55) / 12))).toFixed(3));

  return { score, predictedCloseProb };
}
