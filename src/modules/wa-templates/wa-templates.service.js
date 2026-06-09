import { AppError } from '../../utils/AppError.js';
import { WaTemplate } from '../../models/WaTemplate.js';
import { env } from '../../config/env.js';

export const list = (tenantId) =>
  WaTemplate.find({ tenantId }).sort({ status: 1, name: 1 });

export const getById = async (tenantId, id) => {
  const t = await WaTemplate.findOne({ _id: id, tenantId });
  if (!t) throw new AppError('Template not found', 404);
  return t;
};

export const create = (tenantId, data) =>
  WaTemplate.create({ ...data, tenantId });

export const update = async (tenantId, id, data) => {
  const t = await WaTemplate.findOneAndUpdate({ _id: id, tenantId }, data, {
    new: true, runValidators: true,
  });
  if (!t) throw new AppError('Template not found', 404);
  return t;
};

export const remove = async (tenantId, id) => {
  const t = await WaTemplate.findOneAndDelete({ _id: id, tenantId });
  if (!t) throw new AppError('Template not found', 404);
};

// ── Sync from Meta API ─────────────────────────────────────────────────────────
export const syncFromMeta = async (tenantId, wabaId) => {
  const accessToken = env.whatsappAccessToken;
  if (!accessToken) throw new AppError('WHATSAPP_ACCESS_TOKEN no configurado', 400);
  if (!wabaId)      throw new AppError('Se requiere el WhatsApp Business Account ID (WABA ID)', 400);

  const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100&access_token=${accessToken}`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.error) throw new AppError(`Meta API: ${json.error.message}`, 400);

  const templates = json.data || [];
  let synced = 0;

  for (const tpl of templates) {
    // Parse components
    const header = tpl.components?.find(c => c.type === 'HEADER');
    const body   = tpl.components?.find(c => c.type === 'BODY');
    const footer = tpl.components?.find(c => c.type === 'FOOTER');

    await WaTemplate.findOneAndUpdate(
      { tenantId, name: tpl.name },
      {
        tenantId,
        name:       tpl.name,
        status:     tpl.status,
        category:   tpl.category,
        language:   tpl.language,
        headerText: header?.text || '',
        bodyText:   body?.text   || '',
        footerText: footer?.text || '',
        components: tpl.components || [],
        metaId:     tpl.id,
        syncedAt:   new Date(),
      },
      { upsert: true, new: true, runValidators: false },
    );
    synced++;
  }

  return { synced, total: templates.length };
};
