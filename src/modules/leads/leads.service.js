import { AppError } from '../../utils/AppError.js';
import { Lead } from '../../models/Lead.js';

export const list = (tenantId, filter = {}) =>
  Lead.find({ tenantId, ...filter })
    .populate('assignedTo', 'name email')
    .sort({ createdAt: -1 });

export const getById = async (tenantId, id) => {
  const lead = await Lead.findOne({ _id: id, tenantId });
  if (!lead) throw new AppError('Lead not found', 404);
  return lead;
};

export const create = (tenantId, data) => Lead.create({ ...data, tenantId });

export const update = async (tenantId, id, data) => {
  const lead = await Lead.findOneAndUpdate({ _id: id, tenantId }, data, {
    new: true,
    runValidators: true,
  });
  if (!lead) throw new AppError('Lead not found', 404);
  return lead;
};

export const remove = async (tenantId, id) => {
  const lead = await Lead.findOneAndDelete({ _id: id, tenantId });
  if (!lead) throw new AppError('Lead not found', 404);
  return lead;
};

export const importLeads = async (tenantId, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) throw new AppError('No rows to import', 400);
  if (rows.length > 1000) throw new AppError('Máximo 1000 leads por importación', 400);

  const VALID_STAGES = ['new', 'contacted', 'qualified', 'visit', 'proposal', 'closed', 'lost'];

  const docs = rows.map((r) => ({
    tenantId,
    name:    (r.name    || r.nombre    || '').toString().trim() || 'Sin nombre',
    contact: (r.contact || r.contacto  || r.phone || r.telefono || r.whatsapp || '').toString().trim(),
    email:   (r.email   || r.correo    || '').toString().trim(),
    source:  (r.source  || r.origen    || 'csv').toString().trim().toLowerCase(),
    stage:   VALID_STAGES.includes((r.stage || r.etapa || '').toString().toLowerCase())
               ? (r.stage || r.etapa).toString().toLowerCase()
               : 'new',
    budget:  Number(r.budget || r.presupuesto || 0) || 0,
    notes:   (r.notes  || r.notas || r.comentarios || '').toString().trim(),
    tags:    r.tags ? r.tags.toString().split(',').map(t => t.trim()).filter(Boolean) : [],
  }));

  const inserted = await Lead.insertMany(docs, { ordered: false });
  return { imported: inserted.length, total: rows.length };
};
