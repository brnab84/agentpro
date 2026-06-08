import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    contact: { type: String, trim: true },
    source: { type: String, enum: ['whatsapp', 'instagram', 'email', 'manual'], default: 'manual' },
    budget: { type: Number, min: 0 },
    intent: { type: String, trim: true },
    urgencyDays: { type: Number, min: 0 },
    stage: {
      type: String,
      enum: ['new', 'qualified', 'visit', 'closed', 'lost'],
      default: 'new',
    },
    score: { type: Number, min: 0, max: 100, default: 0 },
    predictedCloseProb: { type: Number, min: 0, max: 1, default: 0 },
    nextAction: { type: String, trim: true },
    aiQualityScore: { type: Number, min: 0, max: 100, default: 0 },
    aiSummary: { type: String, trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const Lead = mongoose.model('Lead', leadSchema);
