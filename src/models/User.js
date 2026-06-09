import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: '' }, // empty for Google OAuth users
    name: { type: String, required: true, trim: true },
    role:     { type: String, enum: ['owner', 'agent'], default: 'owner' },
    googleId: { type: String, trim: true }, // populated on Google OAuth sign-in
  },
  { timestamps: true },
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
