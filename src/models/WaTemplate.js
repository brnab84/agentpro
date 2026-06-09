import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

const waTemplateSchema = new Schema(
  {
    tenantId:   { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name:       { type: String, required: true, trim: true },
    status:     { type: String, enum: ['APPROVED', 'PENDING', 'REJECTED', 'draft'], default: 'draft' },
    category:   { type: String, enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'], default: 'MARKETING' },
    language:   { type: String, default: 'es' },
    headerText: { type: String, trim: true, default: '' },
    bodyText:   { type: String, trim: true, default: '' },
    footerText: { type: String, trim: true, default: '' },
    // Raw Meta components array stored as mixed
    components: { type: [Schema.Types.Mixed], default: [] },
    metaId:     { type: String, trim: true },
    syncedAt:   { type: Date },
  },
  { timestamps: true },
);

waTemplateSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const WaTemplate = mongoose.model('WaTemplate', waTemplateSchema);
