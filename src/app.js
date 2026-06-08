import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { join } from 'path';
import { readFileSync } from 'fs';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

// Read HTML once at startup — avoids file-streaming issues in serverless environments.
let indexHtml;
try {
  indexHtml = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf-8');
} catch {
  indexHtml = '<h1>AgentPro API</h1>';
}
import authRoutes from './modules/auth/auth.routes.js';
import leadRoutes from './modules/leads/leads.routes.js';
import propertyRoutes from './modules/properties/properties.routes.js';
import appointmentRoutes from './modules/appointments/appointments.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import channelRoutes from './modules/channels/channels.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json());
  if (env.nodeEnv === 'development') app.use(morgan('dev'));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/', (req, res) => res.type('html').send(indexHtml));

  app.use('/api/auth', authRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/properties', propertyRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/webhooks', channelRoutes);

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);

  return app;
}
