import bcrypt from 'bcryptjs';
import { AppError } from '../../utils/AppError.js';
import { User } from '../../models/User.js';
import { Tenant } from '../../models/Tenant.js';
import { assertCanAddAgent } from '../billing/limits.service.js';

export const listAgents = (tenantId) =>
  User.find({ tenantId }).select('-passwordHash').sort({ createdAt: 1 });

export async function inviteAgent(tenantId, { name, email, password }) {
  await assertCanAddAgent(tenantId);
  const exists = await User.findOne({ tenantId, email });
  if (exists) throw new AppError('Email already in use for this tenant', 409);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ tenantId, name, email, passwordHash, role: 'agent' });
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

export async function getChannelConfig(tenantId) {
  const tenant = await Tenant.findById(tenantId).select('name channels');
  if (!tenant) throw new AppError('Tenant not found', 404);
  return tenant;
}

export async function updateChannelConfig(tenantId, { whatsappPhoneNumberId, instagramPageId }) {
  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { 'channels.whatsappPhoneNumberId': whatsappPhoneNumberId || '', 'channels.instagramPageId': instagramPageId || '' },
    { new: true },
  );
  if (!tenant) throw new AppError('Tenant not found', 404);
  return tenant;
}

export async function removeAgent(tenantId, id) {
  const user = await User.findOne({ _id: id, tenantId });
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'owner') throw new AppError('Cannot remove the owner', 403);
  await user.deleteOne();
}
