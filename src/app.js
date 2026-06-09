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

let indexHtml;
try {
  indexHtml = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf-8');
} catch {
  indexHtml = '<h1>AgentPro API</h1>';
}

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));
  if (env.nodeEnv === 'development') app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));
  app.get('/api/version', (_req, res) => res.json({ version: APP_VERSION }));
  app.get('/', (_req, res) => res.type('html').send(indexHtml));

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

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);

  return app;
}
