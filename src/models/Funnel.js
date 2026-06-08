import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

const profileSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    message: { type: String, trim: true },
    stage: { type: String, trim: true },
    tag: { type: String, trim: true },
    notifyWhatsapp: { type: Boolean, default: false },
    notifyEmail: { type: Boolean, default: false },
    priority: { type: Boolean, default: false },
  },
  { _id: true },
);

const funnelSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    channel: { type: String, enum: ['whatsapp', 'instagram'], default: 'whatsapp' },
    phoneNumberId: { type: String, trim: true },
    status: { type: String, enum: ['active', 'paused', 'draft'], default: 'draft' },
    trigger: { keyword: { type: String, trim: true } },
    context: { type: String, trim: true },
    requireEmail: { type: Boolean, default: false },
    cancelMinutes: { type: Number, default: 60 },
    profiles: { type: [profileSchema], default: [] },
    totalExecutions: { type: Number, default: 0 },
    completedExecutions: { type: Number, default: 0 },
    cancelledExecutions: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Funnel = mongoose.model('Funnel', funnelSchema);
