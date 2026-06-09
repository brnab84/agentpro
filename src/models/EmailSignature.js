import mongoose from 'mongoose';
const { Schema } = mongoose;

const emailSignatureSchema = new Schema(
  {
    tenantId:  { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name:      { type: String, required: true, trim: true },   // "Firma Principal"
    html:      { type: String, default: '' },                  // HTML content
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const EmailSignature = mongoose.model('EmailSignature', emailSignatureSchema);
