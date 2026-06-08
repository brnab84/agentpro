import { z } from 'zod';

export const createPropertySchema = z.object({
  title: z.string().min(2, 'title too short'),
  zone: z.string().optional(),
  price: z.number().min(0).optional(),
  beds: z.number().min(0).optional(),
  baths: z.number().min(0).optional(),
  area: z.number().min(0).optional(),
  type: z.enum(['house', 'apartment', 'land', 'commercial']).optional(),
  status: z.enum(['available', 'reserved', 'sold']).optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  photos: z.array(z.string()).optional(),
  sourceUrl: z.string().optional(),
});

export const updatePropertySchema = createPropertySchema.partial();
