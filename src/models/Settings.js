import mongoose from 'mongoose';

// Singleton document holding platform-wide configuration (plan pricing, etc.).
const planSchema = new mongoose.Schema(
  {
    key:      { type: String, enum: ['free', 'pro', 'business'], required: true },
    label:    { type: String, trim: true },
    price:    { type: Number, min: 0, default: 0 },     // per billing period
    currency: { type: String, trim: true, default: 'USD' },
    interval: { type: String, enum: ['month', 'year'], default: 'month' },
    stripePriceId: { type: String, trim: true, default: '' }, // Stripe Price id (price_...)
    // Payment links per method (subscription/checkout URLs the owner pastes)
    paypalUrl:      { type: String, trim: true, default: '' },
    mercadopagoUrl: { type: String, trim: true, default: '' },
    yappyUrl:       { type: String, trim: true, default: '' },
    // Limits — use -1 for unlimited
    maxProperties: { type: Number, default: -1 },
    maxAgents:     { type: Number, default: -1 },
    maxLeads:      { type: Number, default: -1 },
  },
  { _id: false },
);

const settingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'global', unique: true }, // ensures one doc
    // Which payment methods the business accepts
    payments: {
      methods: { type: [String], default: ['stripe'] }, // any of: stripe, paypal, mercadopago, yappy
    },
    plans: {
      type: [planSchema],
      default: () => ([
        { key: 'free',     label: 'Free',     price: 0,  currency: 'USD', interval: 'month', maxProperties: 15,  maxAgents: 1,  maxLeads: 50 },
        { key: 'pro',      label: 'Pro',      price: 29, currency: 'USD', interval: 'month', maxProperties: 150, maxAgents: 5,  maxLeads: -1 },
        { key: 'business', label: 'Business', price: 79, currency: 'USD', interval: 'month', maxProperties: -1,  maxAgents: -1, maxLeads: -1 },
      ]),
    },
  },
  { timestamps: true },
);

/** Get the singleton settings doc, creating it with defaults if missing. */
settingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ singleton: 'global' });
  if (!doc) doc = await this.create({ singleton: 'global' });
  return doc;
};

export const Settings = mongoose.model('Settings', settingsSchema);
