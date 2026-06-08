import { z } from 'zod';

export const qualifySchema = z.object({
  conversationText: z.string().min(3, 'conversationText too short'),
});
