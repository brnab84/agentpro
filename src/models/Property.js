import mongoose from 'mongoose';

const propertySchema = new mongoose.Schema(
  {
    tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    title:       { type: String, required: true, trim: true },
    zone:        { type: String, trim: true },
    address:     { type: String, trim: true },
    price:       { type: Number, min: 0 },
    currency:    { type: String, default: 'USD', trim: true },
    operation:   { type: String, enum: ['sale', 'rent'], default: 'sale' },
    type:        { type: String, enum: ['house', 'apartment', 'land', 'commercial', 'office', 'warehouse'], default: 'house' },
    status:      { type: String, enum: ['available', 'reserved', 'sold'], default: 'available' },
    description: { type: String, trim: true },
    area:        { type: Number, min: 0 },
    areaTotal:   { type: Number, min: 0 },   // total lot area (surface cubierta vs total)
    beds:        { type: Number, min: 0 },
    baths:       { type: Number, min: 0 },
    parking:     { type: Number, min: 0, default: 0 },
    floor:       { type: Number },            // piso en edificio
    age:         { type: Number, min: 0 },    // antigüedad en años
    features:    { type: [String], default: [] }, // amenidades: ['piscina','gimnasio',...]
    photos:      { type: [String], default: [] },
    sourceUrl:   { type: String, trim: true },
    embedding:   { type: [Number], default: [] },
  },
  { timestamps: true },
);

export const Property = mongoose.model('Property', propertySchema);
