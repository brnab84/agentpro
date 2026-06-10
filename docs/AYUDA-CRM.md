# Guía de uso de AgentPro (base de conocimiento del asistente)

AgentPro es un CRM inmobiliario con IA. Esta guía describe cómo usar cada función. El asistente responde dudas de los usuarios basándose SOLO en esta guía.

## Navegación general
- El menú está a la izquierda. Arriba a la derecha está tu nombre (menú de usuario) con: Configuración, Ver mi portal, Landing page y Cerrar sesión.
- Cada sección carga sus datos al entrar (mientras carga se ve un sombreado animado).

## Dashboard
- Muestra KPIs: leads totales, calificados, conversión, conversaciones activas, score promedio y citas de hoy.
- También: forecast de pipeline, comisiones estimadas, embudo de ventas y origen de leads.

## Leads
- Lista de prospectos. Cada lead tiene nombre, contacto, origen, etapa y score.
- Para crear un lead: botón "Nuevo lead". Se completa nombre y contacto como mínimo.
- Los leads pueden venir de: WhatsApp, Instagram, email, portal público, Meta Ads o carga manual.
- La IA califica al lead (score) y sugiere la próxima mejor acción.
- Límite de leads según el plan (Free tiene tope; Pro/Business más o ilimitado).

## Pipeline
- Vista kanban de los leads por etapa: Nuevo, Calificado, Visita, Cerrado, Perdido.
- Se arrastra una tarjeta entre columnas para cambiar su etapa.
- El botón de editar (lápiz) en una tarjeta abre el lead para modificarlo.

## Propiedades
- Inventario de propiedades. Botón "Nueva Propiedad" para cargar una.
- **Importar desde un link**: en el modal de propiedad, pegás la URL de MercadoLibre/ZonaProp y se autocompletan título, precio, fotos, etc.
- Cada tarjeta tiene un toggle "Portal público" para publicarla en tu portal.
- Botón "Ver portal público" (aparece cuando configuraste el slug) abre tu portal.
- Campos: título, zona, dirección, precio, moneda, operación (venta/alquiler), tipo, estado, ambientes, baños, m², cocheras, descripción, fotos.
- Cargá la dirección completa para que el mapa y el SEO de la ficha sean precisos.

## Agenda
- Calendario de citas. Botón "Nueva Cita" para agendar.
- Se puede conectar con Google Calendar desde Configuración (Equipo) → tarjeta Google Calendar → "Conectar con Google Calendar". Luego "Sincronizar citas".

## Mensajes / Activas / Canales
- "Mensajes" y "Activas" muestran las conversaciones de WhatsApp/Instagram.
- La configuración de canales (WhatsApp Phone Number ID, Instagram Page ID) está en Equipo → "Configuración de canales" (solo dueño).

## Funnels y Campañas
- Funnels: flujos automáticos que responden por palabra clave en WhatsApp.
- Campañas: envíos masivos. Tienen estados: Borrador, Enviando, Enviada, Error.

## Mi Portal Público (Equipo → tarjeta "Mi Portal Público", solo dueño)
Es tu página pública para mostrar propiedades, con su propio link.
- **Activo**: toggle que prende/apaga el portal. Si está apagado, el portal muestra "no disponible".
- **Nombre de la agencia** y **Slug (URL)**: el slug define tu link `tudominio/portal/tu-slug`. Solo letras, números y guiones.
- **Tagline**: frase corta bajo el nombre.
- **WhatsApp de contacto**: en formato internacional (ej +50760000000). Activa el botón verde de WhatsApp del portal.
- **Email de contacto**, **Color principal**, **Logo (URL)**.
- **Imágenes de portada (carrusel)**: subís fotos (botón "Subir") o pegás URLs. Si no agregás ninguna, se usan imágenes inmobiliarias por defecto.
- Después de configurar, tocá "Guardar portal". El link se ve con un botón "Copiar".
- Para publicar propiedades en el portal, activá el toggle "Portal público" en cada propiedad.

### SEO y visibilidad en Google (dentro de Mi Portal)
- "Permitir que Google indexe el portal": dejalo activado para salir en búsquedas.
- Meta título y meta descripción: lo que muestra Google. Si se dejan vacíos, se generan solos.
- Palabras clave: términos por los que querés posicionar.
- ID de Google Analytics (GA4): pegás tu ID `G-XXXX` para medir visitas.
- Meta Pixel ID: pegás tu ID de píxel (solo números) para retargeting (mostrar anuncios a quien visitó el portal).
- Botón "Guía" abre un instructivo paso a paso (Search Console, Business Profile, redes, etc.).
- El sitemap está en `tudominio/sitemap.xml` (se envía a Google Search Console).

## Plan y facturación (Equipo → "Plan y facturación", solo dueño)
- Muestra tu plan actual (Free/Pro/Business) y el uso: propiedades, leads y usuarios vs el límite del plan.
- Para mejorar de plan, aparecen botones de pago según los métodos activos (Stripe, PayPal, MercadoPago, Yappy).
- Cuentas sin suscripción quedan en Free y funcionan con esos límites.
- Stripe y, si están configurados, PayPal/MercadoPago activan el plan automáticamente al pagar.

## Captación de leads (Meta Ads) (Equipo → "Captación de leads (Meta Ads)")
- Conecta los formularios de Lead Ads de Facebook/Instagram con el CRM: cuando alguien completa un formulario de tu anuncio, entra solo como lead.
- Pasos: pegar el Facebook Page ID + un Page Access Token (permiso leads_retrieval), y configurar en tu app de Meta el webhook (URL que muestra la tarjeta) con el campo "leadgen" y el verify token indicado.
- Se puede probar gratis con el "Lead Ads Testing Tool" de Meta (sin gastar en anuncios).
- Importante: no se pueden obtener datos de desconocidos; la gente interesada deja sus datos voluntariamente al completar el formulario del anuncio.

## Panel de Admin (solo superadmin)
- Aparece "Admin" en el menú si tu email está autorizado.
- Muestra: total de cuentas, usuarios, activos, propiedades, leads, MRR estimado, distribución por plan y altas por mes.
- Tabla de cuentas: cambiar plan (otorgar Pro/Business gratis = "Cortesía"), suspender/activar (Suspendida = no puede iniciar sesión, no borra datos), resetear contraseña y borrar cuenta (borra todos sus datos, pide confirmar el nombre).
- Precios de los planes: editar nombre, precio, moneda, intervalo, límites (propiedades/leads/usuarios) y datos de pago (Stripe Price ID, PayPal Plan ID, links).
- Métodos de pago aceptados: marcar cuáles ofrecer (Stripe/PayPal/MercadoPago/Yappy).

## Preguntas frecuentes
- "No veo el portal / dice no disponible": activá el toggle "Activo" en Mi Portal y guardá.
- "El WhatsApp del portal no abre": cargá el número en formato internacional y guardá.
- "No aparece Admin": tu email debe estar en la variable ADMIN_EMAILS y tenés que volver a iniciar sesión o refrescar.
- "Cambié el precio y no se ve en el landing": refrescá con Ctrl+Shift+R (el landing toma los precios del panel de Admin).
- "Quiero más propiedades/leads y no me deja": llegaste al límite de tu plan; mejorá el plan en Plan y facturación.
