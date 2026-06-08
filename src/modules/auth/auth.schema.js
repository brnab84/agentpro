import { z } from 'zod';

export const registerSchema = z.object({
  tenantName: z.string().min(2, 'tenantName too short'),
  name: z.string().min(2, 'name too short'),
  email: z.string().email('invalid email'),
  password: z.string().min(8, 'password must be at least 8 chars'),
});

export const loginSchema = z.object({
  email: z.string().email('invalid email'),
  password: z.string().min(1, 'password required'),
});
