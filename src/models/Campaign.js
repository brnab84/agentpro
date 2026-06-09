import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

const campaignSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    channel: { type: String, enum: ['whatsapp', 'instagram'], default: 'whatsapp' },
    // Target filter — all conditions are ANDed; empty = all leads
    filter: {
      stage: { type: String, default: '' },
      tag: { type: String, default: '' },
      funnelProfile: { type: String, default: '' }, // profile name from a funnel execution
    },
    status: {
      type: String,
      enum: ['draft', 'sending', 'sent', 'failed'],
      default: 'draft',
    },
    sentCount: { type: Number, default: 0 },
    targetCount: { type: Number, default: 0 },
    scheduledAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Campaign = mongoose.model('Campaign', campaignSchema);
