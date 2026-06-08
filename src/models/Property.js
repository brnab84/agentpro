import mongoose from 'mongoose';

const propertySchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    title: { type: String, required: true, trim: true },
    zone: { type: String, trim: true },
    price: { type: Number, min: 0 },
    beds: { type: Number, min: 0 },
    baths: { type: Number, min: 0 },
    type: { type: String, enum: ['house', 'apartment', 'land', 'commercial'], default: 'house' },
    status: { type: String, enum: ['available', 'reserved', 'sold'], default: 'available' },
    embedding: { type: [Number], default: [] },
  },
  { timestamps: true },
);

export const Property = mongoose.model('Property', propertySchema);
