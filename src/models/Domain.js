import { Schema, model } from 'mongoose';

const domainSchema = new Schema({
  tenantId:  { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  domain:    { type: String, required: true, trim: true },
  verified:  { type: Boolean, default: false },
  dkimKey:   { type: String },
  spfRecord: { type: String },
  status:    { type: String, enum: ['pending', 'verified', 'failed'], default: 'pending' },
}, { timestamps: true });

domainSchema.index({ tenantId: 1, domain: 1 }, { unique: true });
export const Domain = model('Domain', domainSchema);
