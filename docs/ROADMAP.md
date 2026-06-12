# AgentPro — Roadmap / Pendientes

Estado al **2026-06-12** (v3.22.1). Lista viva: marcá lo que se vaya completando.

## 🔧 Configuración para "ir a producción" (solo cargar variables en Railway)
- [ ] **Email (Resend)** → `RESEND_API_KEY` (+ `RESEND_FROM_EMAIL`). Habilita: recuperación de contraseña por email + notificaciones.
- [ ] **Dominio propio** → `APP_BASE_URL` con tu dominio final (links canónicos, sitemap, previews, checkout).
- [ ] **Clave de recuperación** → `RESET_SECRET` (ya usada para recuperar acceso).
- [ ] **Admin** → `ADMIN_EMAILS` (ya configurado).

## 💳 Pagos (activar cuando tengas las cuentas)
- [ ] **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` + Price IDs por plan. (Activación automática lista.)
- [ ] **MercadoPago**: `MP_ACCESS_TOKEN` + moneda del plan = país de la cuenta (ARS/MXN…). Webhook configurado. `MP_WEBHOOK_SECRET` opcional (firma).
- [ ] **PayPal**: `PAYPAL_CLIENT_ID/SECRET`, `PAYPAL_ENV`, Plan IDs (P-…), webhook + `PAYPAL_WEBHOOK_ID` opcional (firma).
- [ ] **Yappy**: hoy solo por link manual. Pendiente: integración API con activación automática.

## 📣 Captación / Marketing
- [ ] **Meta Lead Ads**: probar con el "Lead Ads Testing Tool" (gratis) y lanzar una campaña real.
- [ ] **Píxel de Meta**: verificar con Meta Pixel Helper; usar para retargeting.
- [ ] **Google Search Console**: enviar `tudominio/sitemap.xml`.
- [ ] **Google Business Profile**: crear ficha + enlazar el portal.
- [ ] **GA4 — evento de conversión** cuando el portal captura un lead (no implementado aún).

## 🏠 Portal público (mejoras)
- [ ] **Más personalización** (en curso): temas/plantillas, clonar estilo de un ejemplo, secciones extra, layout, colores secundarios, etc.
- [ ] Galería mosaico: ajustes finos (proporciones, cantidad visible).

## 🤖 IA
- [ ] Asistente del portal: probar captura de leads clasificados en producción.
- [ ] (Opcional) Recomendaciones del asistente con más contexto / filtros.

## 🔒 Seguridad (hecho en v3.20–3.21; queda verificar/configurar)
- [x] SSRF guard en import, rate limiting, escape regex/XSS, CSP, CORS, firmas de webhook (gated).
- [ ] **Verificar el CSP en navegador** (que CRM/portal/mapa/pagos carguen ok tras el deploy).

## 🧹 Deuda técnica
- [ ] **Refactor de `public/index.html`** (~7.000 líneas) en módulos. Diferido: estructural, necesita pruebas en navegador (no es seguridad).
- [ ] Tests automatizados (no hay suite hoy).
