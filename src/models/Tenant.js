import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    plan: { type: String, enum: ['free', 'pro', 'business'], default: 'free' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    channels: {
      whatsappPhoneNumberId: { type: String, trim: true },
      instagramPageId: { type: String, trim: true },
    },
  },
  { timestamps: true },
);

export const Tenant = mongoose.model('Tenant', tenantSchema);
