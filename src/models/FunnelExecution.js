import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

const funnelExecutionSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    funnelId: { type: Types.ObjectId, ref: 'Funnel', required: true, index: true },
    leadId: { type: Types.ObjectId, ref: 'Lead' },
    conversationId: { type: Types.ObjectId, ref: 'Conversation' },
    externalId: { type: String, required: true },
    channel: { type: String, enum: ['whatsapp', 'instagram'], required: true },
    status: { type: String, enum: ['running', 'completed', 'cancelled'], default: 'running', index: true },
    phase: { type: String, enum: ['profiling', 'done'], default: 'profiling' },
    flowStepIndex: { type: Number, default: 0 },
    profile: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

funnelExecutionSchema.index({ tenantId: 1, externalId: 1, status: 1 });

export const FunnelExecution = mongoose.model('FunnelExecution', funnelExecutionSchema);
