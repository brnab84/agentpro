import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

const profileSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    message: { type: String, trim: true },
    stage: { type: String, trim: true },
    tag: { type: String, trim: true },
    color: { type: Number, default: 0 },
    notifyWhatsapp: { type: Boolean, default: false },
    notifyEmail: { type: Boolean, default: false },
    priority: { type: Boolean, default: false },
  },
  { _id: true },
);

const questionSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    type: { type: String, enum: ['selection', 'open'], default: 'selection' },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    aiContext: { type: String, trim: true },
  },
  { _id: true },
);

const contextFileSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    text: { type: String, default: '' },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

// Branch inside a 'paths' flow block — one per profile
const pathBranchSchema = new Schema(
  {
    profileName: { type: String, required: true, trim: true },
    steps: [
      {
        type: { type: String, enum: ['message', 'move_stage', 'add_tag', 'wait'] },
        text: { type: String, trim: true },
        minutes: { type: Number },
        stage: { type: String, trim: true },
        tag: { type: String, trim: true },
        _id: false,
      },
    ],
  },
  { _id: false },
);

const flowStepSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['message', 'profiling', 'wait', 'move_stage', 'add_tag', 'paths', 'capture_data'],
      required: true,
    },
    text: { type: String, trim: true },
    minutes: { type: Number },
    stage: { type: String, trim: true },
    tag: { type: String, trim: true },
    // For 'capture_data' block
    fields: { type: [String], default: [] }, // e.g. ['name','email','phone']
    // For 'paths' block
    branches: { type: [pathBranchSchema], default: [] },
  },
  { _id: true },
);

const funnelSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    channel: { type: String, enum: ['whatsapp', 'instagram'], default: 'whatsapp' },
    phoneNumberId: { type: String, trim: true },
    status: { type: String, enum: ['active', 'paused', 'draft'], default: 'draft' },
    trigger: { keyword: { type: String, trim: true } },
    context: { type: String, trim: true },
    requireEmail: { type: Boolean, default: false },
    cancelMinutes: { type: Number, default: 60 },
    profiles: { type: [profileSchema], default: [] },
    questions: { type: [questionSchema], default: [] },
    flow: { type: [flowStepSchema], default: [] },
    customPrompt: { type: String, trim: true, default: '' },
    contextFiles: { type: [contextFileSchema], default: [] },
    totalExecutions: { type: Number, default: 0 },
    completedExecutions: { type: Number, default: 0 },
    cancelledExecutions: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Funnel = mongoose.model('Funnel', funnelSchema);
