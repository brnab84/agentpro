import rateLimit from 'express-rate-limit';

const make = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });

// Generous global cap (per IP) to blunt scraping/abuse without bothering users.
export const apiLimiter  = make(15 * 60 * 1000, 600, 'Demasiadas solicitudes. Probá de nuevo en unos minutos.');

// Tight cap on auth to slow brute-force / credential stuffing.
export const authLimiter = make(15 * 60 * 1000, 20, 'Demasiados intentos. Esperá unos minutos.');

// Per-minute cap on endpoints that cost money / spam (AI, imports, lead forms).
export const aiLimiter   = make(60 * 1000, 15, 'Demasiadas consultas seguidas. Esperá un momento.');
