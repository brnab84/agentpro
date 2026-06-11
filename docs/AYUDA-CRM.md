# Guía de uso de AgentPro (base de conocimiento del asistente)

AgentPro es un CRM inmobiliario con IA. El asistente de ayuda responde dudas de los usuarios basándose ÚNICAMENTE en esta guía. Está organizada por cada ítem del menú lateral.

> NOTA DE MANTENIMIENTO (para desarrolladores): cada vez que se agrega o cambia una función, hay que actualizar esta guía. El asistente la lee en cada consulta, así que mantenerla al día es lo que hace que el bot sepa explicar las funciones nuevas.

---

## Navegación general
- El menú principal está a la izquierda. Abajo está tu usuario y "Cerrar sesión".
- Arriba a la derecha: buscador global, y tu nombre (menú con Configuración, Ver mi portal, Landing page, Cerrar sesión).
- Abajo a la derecha hay un botón 💬 de **Asistente de ayuda** (este bot).
- Mientras una sección carga, se ve un sombreado animado (shimmer).

---

## Dashboard
Qué es: el resumen de tu negocio.
- KPIs arriba: Leads totales, Calificados, % de conversión, conversaciones En curso, Score promedio y Citas de hoy.
- Forecast de Pipeline: valor estimado de los leads por etapa.
- Comisiones (ganadas y proyectadas), Embudo de Ventas, Origen de Leads y Top Funnels.
- No requiere acción: es solo lectura.

## Leads
Qué es: tu lista de prospectos/clientes potenciales.
- Cada lead tiene nombre, contacto, origen, etapa y score (calificación con IA).
- Crear lead: botón "Nuevo lead" → completá al menos nombre y contacto (teléfono o email).
- Origen posible: WhatsApp, Instagram, Email, Portal público, Meta Ads o Manual.
- Al abrir un lead, la IA calcula su score, probabilidad de cierre, le sugiere la próxima acción y propiedades que le pueden interesar (matching).
- Hay un límite de leads según tu plan (Free tiene tope; Pro/Business más alto o ilimitado). Si llegás al tope, mejorá el plan en "Plan y facturación".

## Agenda
Qué es: el calendario de citas/visitas.
- Botón "Nueva Cita" para agendar (con fecha, lead, etc.).
- Navegás meses con las flechas ‹ › y el botón "Hoy".
- Al hacer clic en un día ves sus citas a la derecha.
- Integración con Google Calendar: se conecta desde Equipo → tarjeta "Google Calendar" → "Conectar con Google Calendar", y luego "Sincronizar citas".

## Propiedades
Qué es: tu inventario de propiedades.
- Crear: botón "Nueva Propiedad". Campos: título, zona, dirección, precio, moneda, operación (venta/alquiler), tipo (casa, depto, terreno, etc.), estado (disponible/reservada/vendida), ambientes, baños, m², cocheras, piso, antigüedad, descripción, fotos y características.
- **Importar desde un link**: en el modal de propiedad hay una barra azul arriba; pegás la URL de MercadoLibre o ZonaProp y tocás Importar → se autocompletan título, precio, fotos, descripción, etc.
- **Fotos**: podés pegar URLs o subir archivos.
- **Publicar en el portal**: cada tarjeta de propiedad tiene un toggle "Portal público" → actívalo para que aparezca en tu portal.
- Botón "Ver portal público" (arriba) abre tu portal; aparece una vez que configuraste el slug.
- Tip: cargá la dirección completa para que el mapa y el SEO de la ficha sean precisos.
- Hay un límite de propiedades según el plan.

## Pipeline
Qué es: vista kanban (tablero) de los leads por etapa.
- Columnas: Nuevo, Calificado, Visita, Cerrado, Perdido.
- Arrastrá una tarjeta de una columna a otra para cambiar la etapa del lead.
- El botón de editar (lápiz) en una tarjeta abre el lead para modificarlo.
- Muestra el valor estimado por columna.

## Mensajes (Bandeja de entrada)
Qué es: todas las conversaciones de WhatsApp, Instagram y Email en un solo lugar.
- A la izquierda, la lista de conversaciones con filtros: Todos, WhatsApp, Instagram, Email.
- Seleccionás una conversación para ver el chat a la derecha y responder desde el cuadro de texto.
- Botón para activar/desactivar el **bot** por conversación (cuando está activo, la IA responde sola).
- Aviso de 24hs: en WhatsApp, pasadas 24hs desde el último mensaje del cliente, solo se pueden enviar plantillas (HSM).
- Para que lleguen mensajes hay que tener los canales configurados (ver Equipo → Configuración de canales).

## Funnels (Perfilamientos)
Qué es: flujos automáticos que, ante una palabra clave en WhatsApp, califican al lead con IA.
- Crear: botón "Nuevo Funnel" → se abre un asistente con pasos: **Plantilla → Básico → Perfilamiento → Flujo → Contexto → Activar**:
  1. **Plantilla**: elegís una plantilla base o empezás de cero.
  2. **Básico**: nombre del funnel y la **palabra clave** que lo dispara (ej: INFO, HOLA, COTIZAR).
  3. **Perfilamiento**: definís los perfiles de cliente que querés detectar.
  4. **Flujo**: las preguntas/pasos de la conversación.
  5. **Contexto**: podés subir PDFs para que la IA responda con esa info.
  6. **Activar**: dejás el funnel activo.
- En la lista de la izquierda filtrás por estado: Todos, Activo, Borrador, Inactivo.
- Al seleccionar un funnel ves estadísticas (Total, Completadas, En curso), distribución de perfiles, archivos de contexto y los leads calificados. Podés Editar, activar/desactivar o Eliminar.

## Campañas
Qué es: envíos masivos de mensajes segmentados a tus leads.
- Crear: botón "Nueva campaña".
- Estados: Borrador, Enviando, Enviada, Error (filtrables arriba).
- Seleccionás una campaña para ver el detalle; si está en borrador aparece el botón "🚀 Enviar". También Editar y Eliminar.

## Conversaciones Activas
Qué es: seguimiento en tiempo real de todos los funnels en curso (quién está respondiendo, en qué paso va).

## Mis Números
Qué es: gestión de los números de WhatsApp Business conectados.
- Botón "Agregar número" para sumar un número.
- Acá administrás los Phone Number IDs de WhatsApp.

## Plantillas WhatsApp
Qué es: tus plantillas HSM aprobadas por Meta (necesarias para escribir fuera de la ventana de 24hs).
- Botón "Sincronizar con Meta" trae tus plantillas aprobadas.
- También podés crear/gestionar plantillas.

## Mis Emails (sección CORREO)
Qué es: cuentas SMTP para enviar correos desde AgentPro.
- Botón "Agregar cuenta" → configurás SMTP (Gmail, Outlook, corporativo).
- Recomendación: usá "contraseñas de aplicación" por seguridad.
- Sirve para enviar campañas y notificaciones por email.

## Mis Firmas (sección CORREO)
Qué es: firmas de email que se adjuntan automáticamente a tus correos.
- Botón "Nueva firma" para crear una.

## Mis Dominios (sección CORREO)
Qué es: verificación de tus dominios para enviar emails desde tu propio dominio.
- Botón "Agregar dominio" → te muestra los registros DNS que tenés que cargar en tu hosting (GoDaddy, Namecheap, Cloudflare, etc.).
- La verificación puede tardar hasta 24hs en propagarse.

## Reportes PDF
Qué es: generación de reportes del negocio en PDF.
- Reporte de Leads: estado del pipeline, scores, fuentes y conversiones.
- Reporte de Comisiones: ganadas, proyectadas y por agente.
- Tocás "Generar PDF" en la tarjeta del reporte que quieras.

## Equipo
Qué es: gestión del equipo y configuración general (la mayoría solo para el dueño/owner).
- **Agentes**: botón "Invitar" para sumar agentes (nombre, email, contraseña). El dueño puede eliminar agentes. Hay un límite de usuarios según el plan.
- **Google Calendar**: conectar/sincronizar tu calendario.
- **Mi Portal Público**: configurar tu portal (ver sección aparte abajo).
- **Plan y facturación**: ver y mejorar tu plan (ver sección aparte abajo).
- **Configuración de canales** (dueño): Phone Number ID de WhatsApp e Instagram Page ID.
- **Captación de leads (Meta Ads)**: conectar formularios de Facebook/Instagram (ver sección aparte abajo).

### Mi Portal Público (dentro de Equipo)
Tu página pública para mostrar propiedades, con su propio link.
1. Completá Nombre de la agencia y **Slug (URL)** (solo letras, números y guiones) → tu link queda `tudominio/portal/tu-slug`.
2. Tagline (frase corta), WhatsApp de contacto (formato internacional, ej +50760000000), Email, Color principal y Logo.
   - **Logo / ícono de la agencia**: podés elegir un emoji inmobiliario (🏠🏢🔑…), subir una imagen o pegar una URL. Prioridad: imagen/URL > emoji > inicial del nombre.
   - **Tipografía del título**: elegís la fuente del nombre grande de la portada (Moderna, Display/impacto, Elegante serif, Redondeada, Monoespaciada).
   - **Animación de entrada**: efecto del título al cargar (Aparecer, Subir, Zoom, Máquina de escribir). Hay una vista previa en vivo en la misma pantalla.
3. Imágenes de portada (carrusel): subí fotos con "Subir" o pegá URLs. Si no agregás ninguna, se usan imágenes por defecto.
4. Activá el toggle **Activo** y tocá **Guardar portal**. Si está apagado, el portal muestra "no disponible".
5. Copiá tu link con el botón "Copiar".
6. Publicá propiedades activando el toggle "Portal público" en cada una (sección Propiedades).
- **SEO y visibilidad en Google** (desplegable): permitir indexación, meta título, meta descripción, palabras clave, ID de Google Analytics (G-XXXX) y Meta Pixel ID (para retargeting). Botón "Guía" con instructivo. El sitemap está en `tudominio/sitemap.xml`.

### Plan y facturación (dentro de Equipo)
- Muestra tu plan actual (Free/Pro/Business) y el uso: propiedades, leads y usuarios contra el límite del plan.
- Para mejorar: aparecen botones de pago según los métodos activos (Stripe, PayPal, MercadoPago, Yappy).
- Stripe, y PayPal/MercadoPago si están configurados por API, activan el plan automáticamente al pagar.
- Las cuentas sin suscripción quedan en Free y funcionan con esos límites.

### Captación de leads (Meta Ads) (dentro de Equipo)
- Conecta los formularios de Lead Ads de Facebook/Instagram con el CRM: cuando alguien completa el formulario de tu anuncio, entra solo como lead.
- Pasos: pegar el Facebook Page ID + un Page Access Token (permiso leads_retrieval), copiar la URL del webhook que muestra la tarjeta y configurarla en tu app de Meta (campo "leadgen" + verify token indicado).
- Se prueba gratis con el "Lead Ads Testing Tool" de Meta, sin gastar en anuncios.
- Importante: no se obtienen datos de desconocidos; la gente interesada deja sus datos voluntariamente al completar el formulario del anuncio.

## Admin (solo superadmin)
Aparece "Admin" en el menú si tu email está autorizado (variable ADMIN_EMAILS) y volviste a iniciar sesión.
- KPIs globales: total de cuentas, usuarios, activos, propiedades, leads, MRR estimado, distribución por plan y altas por mes.
- Tabla de cuentas con acciones:
  - Cambiar plan (dropdown). Otorgar Pro/Business sin pago se marca como "★ Cortesía".
  - Estado (Activa/Suspendida): Suspendida = el dueño y sus agentes no pueden iniciar sesión (no borra datos). Hacé clic para alternar.
  - 🔑 Reset: resetea la contraseña del dueño y te da una temporal para compartir.
  - 🗑 Borrar: elimina la cuenta y TODOS sus datos (pide escribir el nombre para confirmar; no podés borrar tu propia cuenta).
- Precios de los planes: editar nombre, precio, moneda, intervalo, límites (propiedades/leads/usuarios) y datos de pago (Stripe Price ID, PayPal Plan ID, links). Marcar qué métodos de pago aceptás.

## Asistente de ayuda (este bot)
- Botón 💬 abajo a la derecha. Respondé dudas de cómo usar la app.

---

## Preguntas frecuentes
- "No veo el portal / dice no disponible": activá el toggle "Activo" en Mi Portal y guardá.
- "El WhatsApp del portal no abre": cargá el número en formato internacional (+código país) y guardá.
- "No aparece Admin": tu email debe estar en ADMIN_EMAILS y tenés que volver a iniciar sesión o refrescar.
- "Cambié el precio y no se ve en el landing": refrescá con Ctrl+Shift+R (el landing toma los precios del Admin).
- "No me deja crear más propiedades/leads/usuarios": llegaste al límite de tu plan; mejoralo en Plan y facturación.
- "Quiero conectar WhatsApp": configurá el Phone Number ID en Equipo → Configuración de canales.
- "Cómo creo un funnel": Funnels → Nuevo Funnel → seguí los pasos del asistente (palabra clave, perfiles, flujo, contexto, activar).
- "Importé un link y trae pocas/ninguna foto o falla": algunos portales (MercadoLibre, ZonaProp) bloquean la importación automática del servidor porque detectan su IP. Para esos casos usá el **Importador de navegador**: en el modal de Nueva Propiedad, tocá "Importá desde tu navegador →". Arrastrás un botón ("Importar a AgentPro") a tu barra de marcadores; después abrís la propiedad en el portal y hacés clic en ese marcador → como corre en tu navegador (tu IP), no te bloquean y la propiedad entra con las fotos. Encuentra24 sí funciona con la importación normal por link.
