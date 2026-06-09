import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGO_URI', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing env var: ${key}`);
}

export const APP_VERSION = '2.1.0'; // minor: public property portal + CRM portal settings

export const env = {
  port:                 Number(process.env.PORT) || 3000,
  nodeEnv:              process.env.NODE_ENV || 'development',
  mongoUri:             process.env.MONGO_URI,
  jwtSecret:            process.env.JWT_SECRET,
  jwtExpires:           process.env.JWT_EXPIRES || '1d',

  // AI
  anthropicApiKey:      process.env.ANTHROPIC_API_KEY || '',
  aiModel:              process.env.AI_MODEL || 'claude-haiku-4-5-20251001',

  // Messaging channels
  whatsappVerifyToken:  process.env.WHATSAPP_VERIFY_TOKEN || '',
  whatsappAccessToken:  process.env.WHATSAPP_ACCESS_TOKEN || '',
  instagramVerifyToken: process.env.INSTAGRAM_VERIFY_TOKEN || '',
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',

  // Google OAuth (Calendar + Sign-In)
  googleClientId:       process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret:   process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri:    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google/callback',
  appBaseUrl:           process.env.APP_BASE_URL || '',

  // Email — Resend (https://resend.com · free 3000/month)
  resendApiKey:         process.env.RESEND_API_KEY || '',
  resendFromEmail:      process.env.RESEND_FROM_EMAIL || '',
};
