import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    channel: { type: String, enum: ['whatsapp', 'instagram', 'email'], required: true },
    externalId: { type: String, required: true }, // phone number, ig_user_id, or email address
    messages: [messageSchema],
    lastMessageAt: { type: Date, default: Date.now },
    botEnabled: { type: Boolean, default: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

conversationSchema.index({ tenantId: 1, externalId: 1, channel: 1 }, { unique: true });

export const Conversation = mongoose.model('Conversation', conversationSchema);
