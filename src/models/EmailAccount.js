import mongoose from 'mongoose';
const { Schema } = mongoose;

const emailAccountSchema = new Schema(
  {
    tenantId:    { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name:        { type: String, required: true, trim: true },      // "Marketing Spot Realty"
    fromName:    { type: String, trim: true },                      // "Bernardo González"
    fromEmail:   { type: String, required: true, trim: true },      // "bernardo@spotrealty.com"
    smtpHost:    { type: String, trim: true },
    smtpPort:    { type: Number, default: 587 },
    smtpUser:    { type: String, trim: true },
    smtpPass:    { type: String, trim: true },                      // stored encrypted in prod
    smtpSecure:  { type: Boolean, default: false },                 // true = port 465
    status:      { type: String, enum: ['active', 'inactive', 'error'], default: 'active' },
    lastTestedAt: { type: Date },
    lastError:   { type: String },
  },
  { timestamps: true },
);

export const EmailAccount = mongoose.model('EmailAccount', emailAccountSchema);
