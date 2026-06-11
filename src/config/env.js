import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGO_URI', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing env var: ${key}`);
}

export const APP_VERSION = '3.16.1'; // feat: ZonaProp-style photo mosaic on property page (1 big + 4 thumbs + "ver todas")

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

  // Super-admin panel — comma-separated list of authorized emails
  adminEmails:          (process.env.ADMIN_EMAILS || '')
                          .split(',').map(e => e.trim().toLowerCase()).filter(Boolean),

  // Billing — Stripe
  stripeSecretKey:      process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret:  process.env.STRIPE_WEBHOOK_SECRET || '',

  // Billing — MercadoPago (suscripciones / preapproval)
  mpAccessToken:        process.env.MP_ACCESS_TOKEN || '',

  // Billing — PayPal (subscriptions)
  paypalClientId:       process.env.PAYPAL_CLIENT_ID || '',
  paypalSecret:         process.env.PAYPAL_SECRET || '',
  paypalEnv:            process.env.PAYPAL_ENV || 'live', // 'live' | 'sandbox'

  // Lead capture — Meta Lead Ads webhook verify token
  metaVerifyToken:      process.env.META_VERIFY_TOKEN || 'agentpro_leads',

  // Property import — JS-rendering scraping provider (bypasses Cloudflare / lazy images)
  scraperApiKey:        process.env.SCRAPER_API_KEY || '',
  scraperProvider:      process.env.SCRAPER_PROVIDER || 'scraperapi', // 'scraperapi' | 'scrapingbee'

  // Property import — self-hosted headless Chromium (renders JS galleries)
  useHeadless:          process.env.USE_HEADLESS !== 'false', // on by default; needs system Chromium
  chromiumPath:         process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
};
