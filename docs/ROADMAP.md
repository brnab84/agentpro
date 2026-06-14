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
- [x] **Personalización Fase A** (v3.23.0): temas rápidos, clonar estilo desde URL, color secundario, oscuridad del hero.
- [x] **Personalización Fase B** (v3.24.0): modo oscuro, estilo de tarjetas, mostrar/ocultar secciones, "Sobre nosotros", "Por qué elegirnos", testimonios, horarios y redes sociales.
- [x] **Clonado robusto** (v3.25.0): lee HTML+CSS, colores hex/rgb/hsl, fuentes y logo, con vista previa antes de aplicar.
- [x] **Tipografías Google** (v3.26.0), **forma/botones/densidad** (v3.27.0), **portada/encabezado** (v3.28.0), **16 temas + reordenar secciones** (v3.29.0).
- [x] **Importación masiva por CSV** (v3.30.0): plantilla + parseo + carga masiva respetando límite de plan.
- [x] **Importación masiva — bookmarklet "modo masivo"** (v3.31.0): importa todas las fichas de una página de resultados/perfil desde el navegador del usuario (genérico, con iframe + fallback fetch).
- [x] **De-duplicación al importar** (v3.32.0): omite avisos ya importados por `sourceUrl` o por el id del aviso (vp…/ML…/número); el bookmarklet muestra "repetidas".
- [ ] **Bulk en FincaRaíz (elpais) sigue dando "0 fichas"** — pendiente: en esa página los avisos probablemente se cargan por API/cliente y no están en el HTML al hacer clic. A investigar: leer el endpoint/JSON interno o disparar scroll antes de recolectar. (Diagnóstico: correr el snippet de consola que cuenta `/aviso/` en el HTML.)
- [ ] **Asistente IA con acciones** (function calling / tool use): que el asistente no solo lea ayuda sino que ejecute acciones — crear lead, agendar cita en Google Calendar, etc. Ver plan abajo.
- [ ] Galería mosaico: ajustes finos (proporciones, cantidad visible).

## 🤖 IA
- [ ] Asistente del portal: probar captura de leads clasificados en producción.
- [ ] (Opcional) Recomendaciones del asistente con más contexto / filtros.

### Plan: Asistente IA con acciones (tool use / function calling)
Objetivo: que en el CRM le digas "creá un lead Juan Pérez tel 300..." o "agendá una visita el viernes 16hs con ese lead" y lo ejecute (no solo responda texto).
- **Cómo**: el endpoint del asistente del CRM pasa a Claude una lista de **tools** (JSON schema). Claude decide cuándo llamarlas y con qué argumentos; el backend ejecuta la función real y devuelve el resultado; Claude confirma en lenguaje natural.
- **Tools (fase 1)**: `create_lead`, `update_lead_stage`, `search_leads`, `create_property` (opcional), `schedule_appointment` (Google Calendar, ya integrado).
- **Seguridad**: las tools corren con el `tenantId` del usuario autenticado (nunca un id que venga del texto); acciones que cambian datos piden **confirmación** ("Voy a crear el lead Juan Pérez 300… ¿confirmás?") antes de ejecutar; rate-limit con `aiLimiter`.
- **Fases**: (1) crear/buscar/actualizar leads; (2) agendar en Calendar; (3) crear propiedades / publicar en portal; (4) acciones del portal-assistant (con más cuidado, es público).

## 🔒 Seguridad (hecho en v3.20–3.21; queda verificar/configurar)
- [x] SSRF guard en import, rate limiting, escape regex/XSS, CSP, CORS, firmas de webhook (gated).
- [ ] **Verificar el CSP en navegador** (que CRM/portal/mapa/pagos carguen ok tras el deploy).

## 🧹 Deuda técnica
- [ ] **Refactor de `public/index.html`** (~7.000 líneas) en módulos. Diferido: estructural, necesita pruebas en navegador (no es seguridad).
- [ ] Tests automatizados (no hay suite hoy).
