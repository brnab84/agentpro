import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema(
  {
    name:   { type: String, required: true, trim: true },
    plan:   { type: String, enum: ['free', 'pro', 'business'], default: 'free' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    channels: {
      whatsappPhoneNumberId: { type: String, trim: true },
      instagramPageId:       { type: String, trim: true },
    },
    // ── Public property portal ────────────────────────────────────────────────
    slug: { type: String, trim: true, lowercase: true, sparse: true, index: true },
    portal: {
      active:       { type: Boolean, default: false },
      agencyName:   { type: String, trim: true },
      tagline:      { type: String, trim: true },
      primaryColor: { type: String, trim: true, default: '#6366F1' },
      whatsapp:     { type: String, trim: true },
      email:        { type: String, trim: true },
      logoUrl:      { type: String, trim: true },
      heroImages:   { type: [String], default: [] },
      seo: {
        metaTitle:       { type: String, trim: true },
        metaDescription: { type: String, trim: true },
        keywords:        { type: String, trim: true },
        allowIndexing:   { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true },
);

export const Tenant = mongoose.model('Tenant', tenantSchema);
