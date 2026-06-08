import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    datetime: { type: Date, required: true },
    calendarSyncId: { type: String, trim: true },
    status: { type: String, enum: ['scheduled', 'done', 'cancelled'], default: 'scheduled' },
  },
  { timestamps: true },
);

export const Appointment = mongoose.model('Appointment', appointmentSchema);
