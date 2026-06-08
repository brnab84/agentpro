import { z } from 'zod';

export const createAppointmentSchema = z.object({
  leadId: z.string().min(1, 'leadId required'),
  propertyId: z.string().optional(),
  datetime: z.coerce.date(),
  status: z.enum(['scheduled', 'done', 'cancelled']).optional(),
});

export const updateAppointmentSchema = createAppointmentSchema.partial();
