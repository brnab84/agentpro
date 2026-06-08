import { createApp } from '../src/app.js';
import { connectDB } from '../src/config/db.js';

let app;

export default async function handler(req, res) {
  try {
    await connectDB();
    if (!app) app = createApp();
    return app(req, res);
  } catch (err) {
    console.error('[handler error]', err);
    res.status(500).json({ error: err.message });
  }
}
