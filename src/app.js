import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { join } from 'path';
import { readFileSync } from 'fs';
import { env, APP_VERSION } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import leadRoutes from './modules/leads/leads.routes.js';
import propertyRoutes from './modules/properties/properties.routes.js';
import appointmentRoutes from './modules/appointments/appointments.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import channelRoutes from './modules/channels/channels.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import userRoutes from './modules/users/users.routes.js';
import funnelRoutes from './modules/funnels/funnels.routes.js';
import campaignRoutes from './modules/campaigns/campaigns.routes.js';
import waTemplateRoutes from './modules/wa-templates/wa-templates.routes.js';
import phoneNumberRoutes from './modules/phone-numbers/phone-numbers.routes.js';
import emailAccountRoutes from './modules/email-accounts/email-accounts.routes.js';
import emailSignatureRoutes from './modules/email-signatures/email-signatures.routes.js';
import domainRoutes from './modules/domains/domains.routes.js';
import googleRoutes from './modules/google/google.routes.js';
import portalRoutes from './modules/portal/portal.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import billingRoutes from './modules/billing/billing.routes.js';
import { webhook as billingWebhook } from './modules/billing/billing.controller.js';
import { Settings } from './models/Settings.js';
import { renderListingHtml, renderPropertyHtml, buildRobotsTxt, buildSitemap } from './modules/portal/portal.seo.js';

/** Public base URL for canonical/OG tags. Prefers APP_BASE_URL, else the request host. */
const baseUrlOf = (req) =>
  (env.appBaseUrl && env.appBaseUrl.replace(/\/$/, '')) || `${req.protocol}://${req.get('host')}`;

const readHtml = (filename, fallback = '<h1>AgentPro</h1>') => {
  try { return readFileSync(join(process.cwd(), 'public', filename), 'utf-8'); }
  catch { return fallback; }
};

const indexHtml          = readHtml('index.html');
const landingHtml        = readHtml('landing.html', indexHtml);
const portalListingHtml  = readHtml('portal-listing.html', indexHtml);
const portalPropertyHtml = readHtml('portal-property.html', indexHtml);

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());

  // Stripe webhook needs the raw body for signature verification — mount BEFORE json parser.
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhook);

  app.use(express.json({ limit: '25mb' }));
  if (env.nodeEnv === 'development') app.use(morgan('dev'));

  // Static assets (favicon, etc.)
  app.use(express.static(join(process.cwd(), 'public'), { index: false }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));
  app.get('/api/version', (_req, res) => res.json({ version: APP_VERSION }));

  // Public plan pricing (for landing + future checkout)
  app.get('/api/plans', async (_req, res, next) => {
    try {
      const s = await Settings.getSingleton();
      res.setHeader('Cache-Control', 'no-store');
      res.json({ plans: s.plans, payments: s.payments || { methods: ['stripe'] } });
    } catch (err) { next(err); }
  });

  // Landing page
  app.get('/landing', (_req, res) => res.type('html').send(landingHtml));

  // SEO: robots + sitemap
  app.get('/robots.txt', (req, res) => res.type('text/plain').send(buildRobotsTxt(baseUrlOf(req))));
  app.get('/sitemap.xml', async (req, res, next) => {
    try { res.type('application/xml').send(await buildSitemap(baseUrlOf(req))); }
    catch (err) { next(err); }
  });

  // Public portal pages — SEO meta injected server-side, then JS hydrates the data
  app.get('/portal/:slug/propiedad/:id', async (req, res, next) => {
    try {
      const html = await renderPropertyHtml(req.params.slug, req.params.id, baseUrlOf(req), portalPropertyHtml);
      res.type('html').send(html);
    } catch (err) { next(err); }
  });
  app.get('/portal/:slug', async (req, res, next) => {
    try {
      const html = await renderListingHtml(req.params.slug, baseUrlOf(req), portalListingHtml);
      res.type('html').send(html);
    } catch (err) { next(err); }
  });

  // App (SPA — no-cache so version polling works)
  app.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.type('html').send(indexHtml);
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/properties', propertyRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/webhooks', channelRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/funnels', funnelRoutes);
  app.use('/api/campaigns', campaignRoutes);
  app.use('/api/wa-templates', waTemplateRoutes);
  app.use('/api/phone-numbers', phoneNumberRoutes);
  app.use('/api/email-accounts', emailAccountRoutes);
  app.use('/api/email-signatures', emailSignatureRoutes);
  app.use('/api/domains', domainRoutes);
  app.use('/api/google', googleRoutes);
  app.use('/api/portal', portalRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/billing', billingRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);

  return app;
}
