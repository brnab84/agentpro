import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema(
  {
    name:   { type: String, required: true, trim: true },
    plan:   { type: String, enum: ['free', 'pro', 'business'], default: 'free' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    // ── Billing (Stripe) ─────────────────────────────────────────────────────
    billing: {
      stripeCustomerId:     { type: String, trim: true },
      stripeSubscriptionId: { type: String, trim: true },
      subscriptionStatus:   { type: String, trim: true, default: '' }, // active, past_due, canceled, trialing…
      currentPeriodEnd:     { type: Date },
      provider:             { type: String, trim: true, default: '' }, // stripe | mercadopago | paypal | comp
      mpPreapprovalId:      { type: String, trim: true }, // MercadoPago subscription id
      paypalSubscriptionId: { type: String, trim: true }, // PayPal subscription id (I-...)
    },
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
      logoEmoji:    { type: String, trim: true }, // emoji/icon used as logo when no image
      heroImages:   { type: [String], default: [] },
      heroFont:     { type: String, trim: true, default: '' },     // '', serif, display, rounded, mono
      heroAnimation:{ type: String, trim: true, default: '' },     // '', fade, slide, zoom, typewriter
      seo: {
        metaTitle:       { type: String, trim: true },
        metaDescription: { type: String, trim: true },
        keywords:        { type: String, trim: true },
        allowIndexing:   { type: Boolean, default: true },
        analyticsId:     { type: String, trim: true }, // Google Analytics GA4 (G-XXXX)
        metaPixelId:     { type: String, trim: true }, // Meta (Facebook) Pixel id
      },
    },
    // ── Lead capture (Meta Lead Ads) ──────────────────────────────────────────
    leadAds: {
      pageId:    { type: String, trim: true }, // Facebook Page id
      pageToken: { type: String, trim: true }, // Page access token (leads_retrieval)
    },
    // Per-tenant key used by the browser-bookmarklet importer (write: properties)
    importKey: { type: String, trim: true, index: true },
  },
  { timestamps: true },
);

export const Tenant = mongoose.model('Tenant', tenantSchema);
