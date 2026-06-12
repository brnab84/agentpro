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
      primaryColor:   { type: String, trim: true, default: '#6366F1' },
      secondaryColor: { type: String, trim: true, default: '' }, // gradient accent (falls back to a darker primary)
      heroOverlay:    { type: Number, default: 45 },             // hero darkness 0-80 (%)
      whatsapp:     { type: String, trim: true },
      email:        { type: String, trim: true },
      logoUrl:      { type: String, trim: true },
      logoEmoji:    { type: String, trim: true }, // emoji/icon used as logo when no image
      heroImages:   { type: [String], default: [] },
      heroFont:     { type: String, trim: true, default: '' },     // '', serif, display, rounded, mono
      heroAnimation:{ type: String, trim: true, default: '' },     // '', fade, slide, zoom, typewriter
      // ── Layout & visibility ────────────────────────────────────────────────
      layout: {
        cardStyle:   { type: String, trim: true, default: 'rounded' }, // rounded | sharp | flat
        radius:      { type: Number, default: 16 },     // global corner radius (px, 0-28)
        buttonStyle: { type: String, trim: true, default: 'solid' },   // solid | outline | pill
        density:     { type: String, trim: true, default: 'comfortable' }, // compact | comfortable | spacious
        heroLayout:  { type: String, trim: true, default: 'centered' }, // centered | left | solid
        header:      { type: String, trim: true, default: 'solid' },    // solid | transparent
        sectionOrder:{ type: [String], default: ['properties', 'about', 'whyUs', 'testimonials', 'contact'] },
        darkMode:    { type: Boolean, default: false },
        showStats:   { type: Boolean, default: true },  // hero stats (listing)
        showContact: { type: Boolean, default: true },  // contact form
        showMap:     { type: Boolean, default: true },  // property map
        showSimilar: { type: Boolean, default: true },  // similar listings (property)
      },
      // ── Extra content sections ─────────────────────────────────────────────
      sections: {
        about:        { type: String, trim: true, default: '' },   // "Sobre nosotros"
        whyUs:        { type: [String], default: [] },             // "Por qué elegirnos" bullets
        hours:        { type: String, trim: true, default: '' },   // horarios de atención
        testimonials: { type: [{ name: String, text: String }], default: [] },
        social: {
          instagram: { type: String, trim: true, default: '' },
          facebook:  { type: String, trim: true, default: '' },
          tiktok:    { type: String, trim: true, default: '' },
          website:   { type: String, trim: true, default: '' },
        },
      },
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
