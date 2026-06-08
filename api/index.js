import { createApp } from '../src/app.js';
import { connectDB } from '../src/config/db.js';

// App se inicializa una vez y se reutiliza entre invocaciones (Vercel warm instances).
let app;

export default async function handler(req, res) {
  await connectDB();
  if (!app) app = createApp();
  return app(req, res);
}
