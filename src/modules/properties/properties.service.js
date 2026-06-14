import { AppError } from '../../utils/AppError.js';
import { Property } from '../../models/Property.js';
import { assertCanAddProperty } from '../billing/limits.service.js';
import { escapeRegex } from '../../utils/escapeRegex.js';

// ── Import de-duplication ─────────────────────────────────────────────────────
/** Pull a stable listing id from a source URL (FincaRaíz vp…, ML MLA…, or a long number). */
function listingIdFromUrl(url) {
  const m = String(url || '').match(/vp\d{4,}|ML[A-Z]\d{4,}|\d{6,}/i);
  return m ? m[0] : '';
}

/**
 * Find an already-imported property that matches this source URL — by exact URL
 * or by the listing id embedded in it (so the same aviso under two URLs/slugs is
 * detected). Returns the existing doc or null.
 */
export async function findImportDuplicate(tenantId, url) {
  if (!url) return null;
  const exact = await Property.findOne({ tenantId, sourceUrl: url }).select('_id title');
  if (exact) return exact;
  const id = listingIdFromUrl(url);
  if (id) {
    const byId = await Property.findOne({ tenantId, sourceUrl: new RegExp(escapeRegex(id), 'i') }).select('_id title');
    if (byId) return byId;
  }
  return null;
}

export const list = (tenantId, filter = {}) =>
  Property.find({ tenantId, ...filter }).sort({ createdAt: -1 });

export const getById = async (tenantId, id) => {
  const item = await Property.findOne({ _id: id, tenantId });
  if (!item) throw new AppError('Property not found', 404);
  return item;
};

export const create = async (tenantId, data) => {
  await assertCanAddProperty(tenantId);
  return Property.create({ ...data, tenantId });
};

export const update = async (tenantId, id, data) => {
  const item = await Property.findOneAndUpdate({ _id: id, tenantId }, data, {
    new: true,
    runValidators: true,
  });
  if (!item) throw new AppError('Property not found', 404);
  return item;
};

export const remove = async (tenantId, id) => {
  const item = await Property.findOneAndDelete({ _id: id, tenantId });
  if (!item) throw new AppError('Property not found', 404);
  return item;
};

// ── Bulk CSV import ───────────────────────────────────────────────────────────
const BULK_MAX = 300;
const OPERATION_MAP = { venta:'sale', sale:'sale', vender:'sale', alquiler:'rent', rent:'rent', alquilar:'rent', renta:'rent' };
const TYPE_MAP = {
  casa:'house', house:'house', departamento:'apartment', depto:'apartment', apartamento:'apartment', apartment:'apartment',
  terreno:'land', lote:'land', land:'land', local:'commercial', comercial:'commercial', commercial:'commercial',
  oficina:'office', office:'office', deposito:'warehouse', depósito:'warehouse', galpon:'warehouse', warehouse:'warehouse',
};
const num = (v) => {
  if (v == null || v === '') return undefined;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};
const splitList = (v) => String(v || '').split(/[;|\n]+/).map(s => s.trim()).filter(Boolean);

/** Map one CSV row (already keyed by our field names) to a Property payload. */
function mapBulkRow(row) {
  const title = String(row.title || '').trim();
  if (!title) return null;
  const out = { title };
  if (row.zone)        out.zone        = String(row.zone).trim();
  if (row.address)     out.address     = String(row.address).trim();
  if (row.description) out.description = String(row.description).trim();
  const price = num(row.price);           if (price != null) out.price = price;
  const area = num(row.area);             if (area != null) out.area = area;
  const areaTotal = num(row.areaTotal);   if (areaTotal != null) out.areaTotal = areaTotal;
  const beds = num(row.beds);             if (beds != null) out.beds = beds;
  const baths = num(row.baths);           if (baths != null) out.baths = baths;
  const parking = num(row.parking);       if (parking != null) out.parking = parking;
  if (row.currency) out.currency = String(row.currency).trim().toUpperCase().slice(0, 4);
  const op = OPERATION_MAP[String(row.operation || '').trim().toLowerCase()];   if (op) out.operation = op;
  const ty = TYPE_MAP[String(row.type || '').trim().toLowerCase()];             if (ty) out.type = ty;
  const photos = splitList(row.photos).filter(u => /^https?:\/\//i.test(u)).slice(0, 20);
  if (photos.length) out.photos = photos;
  if (row.features) out.features = splitList(row.features).slice(0, 30);
  return out;
}

/** Create many properties from parsed CSV rows. Respects the plan limit. */
export const bulkCreate = async (tenantId, items) => {
  if (!Array.isArray(items) || !items.length) throw new AppError('No hay filas para importar', 400);
  if (items.length > BULK_MAX) throw new AppError(`Máximo ${BULK_MAX} filas por importación`, 400);

  let created = 0, skipped = 0, limitReached = false;
  const errors = [];
  for (let i = 0; i < items.length; i++) {
    const payload = mapBulkRow(items[i] || {});
    if (!payload) { skipped++; errors.push({ row: i + 1, error: 'Falta el título' }); continue; }
    try {
      await assertCanAddProperty(tenantId);
      await Property.create({ ...payload, tenantId });
      created++;
    } catch (err) {
      if (/límite|limit|plan/i.test(err.message)) { limitReached = true; break; }
      skipped++; errors.push({ row: i + 1, error: err.message });
    }
  }
  return { created, skipped, limitReached, errors: errors.slice(0, 20) };
};
