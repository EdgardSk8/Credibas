# Identidad visual y metadatos

Cómo Credibas construye favicons, imagen social, SEO técnico y el modo oro a partir de un único logo.

> **Requisito:** el proyecto debe tener `LOGO.png` en la raíz. El sistema no inventa ni dibuja un logo: lo deriva, lo recorta y lo publica en todos los tamaños.

---

## 1. Punto de partida: un solo logo

`LOGO.png` (2000×2000) contiene el monograma dorado sobre fondo `#17211F`. El script lo procesa una vez y genera todo lo demás:

- Detecta el fondo y extrae el monograma con **transparencia real** (canal alfa por distancia de color), conservando los bordes suavizados.
- Recorta el espacio vacío y centra el símbolo en lienzos cuadrados.
- Compone la imagen social 1200×630 usando el mismo monograma.

Si cambias el logo, vuelve a ejecutar:

```bash
node scripts/generate-brand-assets.mjs
```

El comando **falla con un mensaje claro** si `LOGO.png` no existe. No hay placeholders genéricos.

---

## 2. Archivos generados

| Archivo | Tamaño | Para qué |
| --- | --- | --- |
| `public/favicon.ico` | 16, 32 y 48 px | Pestañas y accesos en Windows, Chrome, Edge, Firefox |
| `public/favicon.svg` | 64×64 | Navegadores modernos que prefieren SVG |
| `public/favicon-16x16.png` | 16×16 | Pestañas de alta densidad |
| `public/favicon-32x32.png` | 32×32 | Pestañas estándar |
| `public/apple-touch-icon.png` | 180×180 | iOS y Safari (icono al añadir a inicio) |
| `public/android-chrome-192x192.png` | 192×192 | Android / PWA |
| `public/android-chrome-512x512.png` | 512×512 | Android / splash / instalación |
| `public/android-chrome-maskable-512x512.png` | 512×512 | Android con máscara (contenido dentro de la zona segura) |
| `public/og-image.png` | 1200×630 | Open Graph, Twitter/X, WhatsApp, LinkedIn, Telegram, Discord |
| `public/brand/logo-mark.png` | 1200 px de ancho | Monograma transparente para la interfaz |
| `public/brand/logo-mark.webp` | 1200 px | Variante moderna |
| `public/brand/logo-tile.png` | 512×512 | Icono cuadrado con fondo de marca |
| `public/site.webmanifest` | — | Nombre, colores, iconos y atajos de la PWA |
| `public/browserconfig.xml` | — | Mosaicos de Windows/Edge |
| `public/sitemap.xml` | — | Generado en cada build |

Todos viven en `public/`, por lo que se sirven públicamente en la raíz del dominio.

---

## 3. Metadatos: HTML inicial, no JavaScript

Los rastreadores de WhatsApp, Facebook, Instagram, Messenger, LinkedIn, Telegram, Discord y X **no ejecutan JavaScript**. Por eso los metadatos no dependen de React.

La solución tiene tres piezas:

```
src/shared/seo-routes.mjs      ← única fuente de verdad (título, descripción, JSON-LD)
        │
        ├── scripts/vite-plugin-seo.mjs   → genera un HTML por ruta en el build
        └── src/client/lib/seo.ts         → mantiene los tags al navegar en la SPA
```

### 3.1 Build: un HTML por ruta

`index.html` contiene un bloque delimitado:

```html
<!--seo-->
  … título, descripción, canonical, Open Graph, Twitter y JSON-LD …
<!--/seo-->
```

Al compilar, el plugin copia `index.html` y reemplaza ese bloque con los datos de cada ruta pública. El resultado queda como:

```
dist/client/index.html          → /
dist/client/precios.html        → /precios
dist/client/funcionalidades.html→ /funcionalidades
dist/client/contacto.html       → /contacto
…
```

El host sirve `/precios` directamente desde `precios.html` sin ejecutar la SPA. El HTML incluye:

- `<title>` y `<meta name="description">` propios.
- `<link rel="canonical">` absoluto.
- `robots` con `index, follow` o `noindex, nofollow`.
- Open Graph completo (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`, `og:locale`, dimensiones y `secure_url`).
- Twitter Card `summary_large_image`.
- JSON-LD (`Organization`, `WebSite`, `WebPage`, `BreadcrumbList`, `SoftwareApplication` y `FAQPage` donde corresponde).

La SPA hidrata sobre ese mismo documento: no hay dos versiones del sitio.

### 3.2 Navegación: la SPA mantiene coherencia

`SeoManager` escucha la ruta y actualiza los mismos tags. Si el usuario entra directo a `/precios` o navega desde el inicio, el título, canonical, OG y JSON-LD quedan correctos. Las rutas privadas (`/app/*`, `/admin/*`) se marcan `noindex, nofollow`.

### 3.3 URL absolutas

Todas las imágenes sociales se publican con HTTPS absoluto:

```html
<meta property="og:image" content="https://credibas.app/og-image.png" />
```

Nunca se usa `og:image` relativo: WhatsApp y LinkedIn lo ignoran.

El dominio se define **una sola vez**:

```js
// src/shared/seo-routes.mjs
export const SITE_URL = 'https://credibas.app';
```

Al cambiarlo, actualiza también `public/robots.txt` y reconstruye.

---

## 4. Rutas con metadatos propios

| Ruta | Indexable | Título |
| --- | --- | --- |
| `/` | Sí | Credibas — Controla tus créditos. Domina tus finanzas. |
| `/funcionalidades` | Sí | Funcionalidades — Credibas |
| `/precios` | Sí | Planes y precios — Credibas |
| `/contacto` | Sí | Contacto — Credibas |
| `/terminos` | Sí | Términos de servicio — Credibas |
| `/privacidad` | Sí | Política de privacidad — Credibas |
| `/login`, `/registro`, `/recuperar-contrasena`, `/restablecer-contrasena`, `/verificar-correo`, `/invitacion` | No | Título propio, `noindex` |
| `/app/*`, `/admin/*` | No | `noindex` + `X-Robots-Tag` |

El `sitemap.xml` incluye solo las seis rutas indexables, con `lastmod`, `changefreq` y `priority`.

**Para añadir una página:** agrega una entrada en `PUBLIC_ROUTES` con `path`, `title`, `description`, `priority`, `changeFrequency` y `schema`. El plugin y la SPA la toman automáticamente.

---

## 5. Structured data

- **Organization**: nombre, URL y logo absoluto.
- **WebSite**: idioma `es-NI` y publisher.
- **WebPage**: una por ruta, con imagen principal.
- **BreadcrumbList**: inicio → página.
- **SoftwareApplication**: categoría `BusinessApplication`, sistema `Web`.
- **FAQPage**: solo en la portada, con las preguntas reales del sitio.
- **AggregateOffer** en precios (`9.90–49.90 USD`).

Los datos describen lo que la página realmente muestra; no se inventan valoraciones ni reseñas.

---

## 6. Compatibilidad

| Plataforma | Qué consume | Resultado |
| --- | --- | --- |
| WhatsApp | OG (HTML inicial) | Tarjeta con imagen 1200×630 |
| Facebook / Messenger | OG | Imagen, título y descripción |
| Instagram (enlace en bio/stories) | OG | Vista previa estándar |
| LinkedIn | OG | `summary_large_image` |
| Telegram | OG | Vista previa con imagen |
| Discord | OG | Embed con imagen |
| X | Twitter Card | `summary_large_image` |
| Chrome / Edge / Firefox | favicon.ico + SVG + PNG | Icono nítido en cada densidad |
| Safari / iOS | apple-touch-icon | Icono al añadir a pantalla de inicio |
| Android | manifest + 192/512 + maskable | Instalación PWA correcta |

---

## 7. Tema claro (oro) predeterminado

La presentación principal de Credibas es clara, corporativa y con dorado. El modo oscuro queda disponible como preferencia opcional:

| Token | Valor |
| --- | --- |
| Dorado de marca (acento) | `#D4AF37` |
| Dorado de relleno (hover) | `#C9A227` |
| Negro verdoso (texto) | `#17211F` |
| Fondo claro verdoso | `#F2F6EF` |
| Dorado de texto (contraste) | `#7A5E12` |

El tema se aplica con `data-theme="gold"` en `<html>` (es el valor por defecto). **No cambia datos ni permisos**: es solo presentación.

### Cómo volver al modo oscuro

- **Menú de cuenta** (arriba a la derecha) → «Volver al modo oscuro».
- **Configuración → Apariencia** → «Modo oscuro».

El tema elegido se guarda en `localStorage` (`credibas-theme-v2`, valores `gold` o `dark`) y se aplica antes del primer pintado con `public/theme-init.js`, evitando el destello de tema.

También puedes cambiarlo desde la consola:

```js
document.documentElement.removeAttribute('data-theme');
localStorage.setItem('credibas-theme-v2', 'dark');
```

Para volver al claro:

```js
document.documentElement.setAttribute('data-theme', 'gold');
localStorage.setItem('credibas-theme-v2', 'gold');
```

### Cómo está construido

Los colores translúcidos usan canales RGB (`--ink-rgb`, `--accent-rgb`, `--surface-rgb`, `--bg-rgb`), de modo que un solo bloque de variables cambia toda la interfaz. El tema oscuro sigue siendo el predeterminado; el modo oro no se aplica a nadie que no lo elija.

---

## 8. Verificación

```bash
npm run build
```

Comprueba en `dist/client/`:

1. `index.html`, `precios.html`, … tienen `<title>`, `canonical`, `og:image` absoluto y JSON-LD.
2. `sitemap.xml` contiene solo las rutas indexables.
3. `og-image.png` mide 1200×630.
4. `favicon.ico` abre en el explorador.
5. `site.webmanifest` referencia iconos existentes.

En producción, valida con:

- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
- [X Card Validator](https://cards-dev.twitter.com/validator)
- [Google Rich Results Test](https://search.google.com/test/rich-results)

Si cambias el dominio, actualiza `SITE_URL`, `public/robots.txt` y vuelve a desplegar. Los rastreadores pueden cachear la vista previa: usa el depurador de cada red para refrescarla.
