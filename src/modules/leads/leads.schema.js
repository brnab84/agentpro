import { z } from 'zod';

export const createLeadSchema = z.object({
  name: z.string().min(2, 'name too short'),
  contact: z.string().optional(),
  source: z.enum(['whatsapp', 'instagram', 'email', 'manual']).optional(),
  budget: z.number().min(0).optional(),
  intent: z.string().optional(),
  urgencyDays: z.number().min(0).optional(),
  stage: z.enum(['new', 'qualified', 'visit', 'closed', 'lost']).optional(),
});

export const updateLeadSchema = createLeadSchema.partial();
