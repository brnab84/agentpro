import mongoose from 'mongoose';

const googleTokenSchema = new mongoose.Schema(
  {
    tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
    email:        { type: String, trim: true },
    accessToken:  { type: String, required: true },
    refreshToken: { type: String },
    expiryDate:   { type: Number },
    scope:        { type: String },
  },
  { timestamps: true },
);

export const GoogleToken = mongoose.model('GoogleToken', googleTokenSchema);
