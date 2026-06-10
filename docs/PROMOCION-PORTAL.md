# Guía para promocionar tu portal de propiedades

Tu portal público vive en una dirección como:

```
https://TU-DOMINIO/portal/tu-slug
```

A partir de la versión **2.6.0**, las páginas ya están optimizadas para SEO y para compartir en redes (meta tags, Open Graph, datos estructurados, `robots.txt` y `sitemap.xml`). Esta guía te explica cómo aprovecharlo.

---

## 1. Configurá el SEO desde el CRM

Entrá a **Configuración → Mi equipo → Mi Portal → "SEO y visibilidad en Google"**:

- **Permitir que Google indexe el portal**: dejalo activado para que aparezca en búsquedas.
- **Meta título**: lo que se ve como título azul en Google. Ej: `Inmobiliaria López — Casas y terrenos en David, Chiriquí`. (~60 caracteres)
- **Meta descripción**: el textito gris debajo del título en Google. Resumí tu propuesta. (~160 caracteres)
- **Palabras clave**: zonas y tipos que querés posicionar. Ej: `inmobiliaria chiriquí, casas en venta panamá, alquiler bocas del toro`.

> Si lo dejás vacío, generamos automáticamente título y descripción con el nombre de tu agencia y tus propiedades.

**Importante:** cargá la **dirección completa** en cada propiedad — así el mapa y el SEO de cada ficha son más precisos.

---

## 2. Google Search Console (indexación)

Es gratis y le dice a Google "indexá mi sitio".

1. Entrá a [search.google.com/search-console](https://search.google.com/search-console).
2. Agregá tu propiedad con el dominio del portal.
3. Verificá la propiedad (la opción más simple es el registro TXT en DNS, o el archivo HTML).
4. En **Sitemaps**, enviá: `https://TU-DOMINIO/sitemap.xml`
5. Usá **Inspección de URL** para pedir indexación de tu portal y de propiedades destacadas.

El sitemap se actualiza solo: incluye tu portal y todas las propiedades publicadas y disponibles.

---

## 3. Google Business Profile (Perfil de Empresa)

Lo que más mueve la aguja para una inmobiliaria local.

1. Creá tu ficha en [business.google.com](https://business.google.com).
2. Completá dirección, teléfono/WhatsApp, horarios y fotos.
3. En el campo **sitio web**, poné el link de tu portal.
4. Pedí reseñas a tus clientes: suben el ranking local y la confianza.

Resultado: aparecés en Google Maps y en el "paquete local" cuando buscan inmobiliarias en tu zona.

---

## 4. Compartir en redes y WhatsApp

Cuando pegás el link del portal o de una propiedad en WhatsApp, Instagram, Facebook o X, ahora aparece una **tarjeta con foto, título y precio** (gracias al Open Graph que inyectamos en el servidor).

- **WhatsApp / Estados**: compartí fichas individuales — el preview con foto y precio genera muchos clics.
- **Instagram**: poné el link del portal en la bio y usá "link en bio" en las historias.
- **Facebook Marketplace / grupos locales**: publicá la propiedad y enlazá a la ficha del portal para la info completa.
- Para verificar cómo se ve el preview:
  - Facebook: [Sharing Debugger](https://developers.facebook.com/tools/debug/)
  - X/Twitter: [Card Validator](https://cards-dev.twitter.com/validator)
  - LinkedIn: [Post Inspector](https://www.linkedin.com/post-inspector/)

---

## 5. Dominio propio (recomendado)

Un dominio como `tuinmobiliaria.com` da más confianza y mejor SEO que una URL larga.

- Comprá el dominio (Namecheap, GoDaddy, Cloudflare).
- Apuntalo a tu hosting/Railway.
- Configurá la variable de entorno **`APP_BASE_URL`** con tu dominio final (ej: `https://tuinmobiliaria.com`) para que los links canónicos, el sitemap y los previews usen esa dirección.

---

## 6. Medir resultados

- **Google Search Console**: qué búsquedas te muestran, clics, posición promedio.
- **Google Analytics (GA4)**: ya está integrado. Para activarlo:
  1. Creá una propiedad GA4 en [analytics.google.com](https://analytics.google.com).
  2. Andá a **Admin → Flujos de datos → Web** y copiá el **ID de medición** (`G-XXXXXXXXXX`).
  3. Pegalo en **Configuración → Mi equipo → Mi Portal → SEO y visibilidad → ID de Google Analytics (GA4)** y guardá.
  4. Listo: el portal y cada ficha de propiedad empiezan a reportar visitas, ubicación de los visitantes, dispositivos y páginas más vistas en tiempo real.
- **Leads en el CRM**: cada consulta del formulario del portal entra como lead con origen "portal" — medí cuántos llegan por ahí.

---

## Checklist rápido

- [ ] SEO configurado en Mi Portal (título, descripción, indexación ON)
- [ ] Direcciones completas cargadas en las propiedades
- [ ] Portal activo y propiedades publicadas
- [ ] `sitemap.xml` enviado a Google Search Console
- [ ] Google Business Profile creado y enlazado
- [ ] Link del portal en bio de Instagram y firma de WhatsApp
- [ ] (Opcional) Dominio propio + `APP_BASE_URL` configurado
