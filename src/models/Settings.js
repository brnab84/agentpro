import mongoose from 'mongoose';

// Singleton document holding platform-wide configuration (plan pricing, etc.).
const planSchema = new mongoose.Schema(
  {
    key:      { type: String, enum: ['free', 'pro', 'business'], required: true },
    label:    { type: String, trim: true },
    price:    { type: Number, min: 0, default: 0 },     // per billing period
    currency: { type: String, trim: true, default: 'USD' },
    interval: { type: String, enum: ['month', 'year'], default: 'month' },
  },
  { _id: false },
);

const settingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'global', unique: true }, // ensures one doc
    plans: {
      type: [planSchema],
      default: () => ([
        { key: 'free',     label: 'Free',     price: 0,  currency: 'USD', interval: 'month' },
        { key: 'pro',      label: 'Pro',      price: 29, currency: 'USD', interval: 'month' },
        { key: 'business', label: 'Business', price: 79, currency: 'USD', interval: 'month' },
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
