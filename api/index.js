import { readFileSync } from 'fs';
import { join } from 'path';
import { createApp } from '../src/app.js';
import { connectDB } from '../src/config/db.js';

// Read HTML once at cold start
let indexHtml;
try {
  indexHtml = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf-8');
} catch (e) {
  indexHtml = '<h1>AgentPro</h1>';
}

let app;

export default async function handler(req, res) {
  // Serve frontend directly — bypass Express for the root path
  if (req.url === '/' || req.url === '') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).end(indexHtml);
    return;
  }

  try {
    await connectDB();
    if (!app) app = createApp();
    app(req, res);
  } catch (err) {
    console.error('[handler]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
}
