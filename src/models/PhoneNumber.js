import mongoose from 'mongoose';
const { Schema } = mongoose;

const phoneNumberSchema = new Schema(
  {
    tenantId:      { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name:          { type: String, required: true, trim: true },
    phoneNumberId: { type: String, required: true, trim: true },
    wabaId:        { type: String, trim: true },
    displayPhone:  { type: String, trim: true },
    status:        { type: String, enum: ['active', 'inactive'], default: 'active' },
    accessToken:   { type: String, trim: true }, // overrides global env token if set
  },
  { timestamps: true },
);

phoneNumberSchema.index({ tenantId: 1, phoneNumberId: 1 }, { unique: true });

export const PhoneNumber = mongoose.model('PhoneNumber', phoneNumberSchema);
