import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_IMAGE,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  LOCALE,
  PUBLIC_ROUTES,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  buildJsonLd,
} from '../src/shared/seo-routes.mjs';

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Bloque de metadatos para una ruta (mismas etiquetas que usa la SPA). */
export function renderSeoBlock(route) {
  const url = absoluteUrl(route.path);
  const image = absoluteUrl(route.image ?? DEFAULT_IMAGE);
  const robots = route.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';

  return `    <title>${escapeHtml(route.title)}</title>
    <meta name="description" content="${escapeHtml(route.description)}" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="${robots}" />
    <meta name="author" content="${SITE_NAME}" />
    <meta name="application-name" content="${SITE_NAME}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:locale" content="${LOCALE}" />
    <meta property="og:title" content="${escapeHtml(route.title)}" />
    <meta property="og:description" content="${escapeHtml(route.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:secure_url" content="${image}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${IMAGE_HEIGHT}" />
    <meta property="og:image:alt" content="${escapeHtml(`${SITE_NAME} — Gestión de créditos y cartera`)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(route.title)}" />
    <meta name="twitter:description" content="${escapeHtml(route.description)}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="${escapeHtml(`${SITE_NAME} — Gestión de créditos y cartera`)}" />

    <script type="application/ld+json">
${JSON.stringify(buildJsonLd(route), null, 2)
  .split('\n')
  .map((line) => `      ${line}`)
  .join('\n')}
    </script>`;
}

function injectSeo(template, route) {
  const startMarker = '<!--seo-->';
  const endMarker = '<!--/seo-->';
  const start = template.indexOf(startMarker);
  const end = template.indexOf(endMarker);

  if (start === -1 || end === -1) {
    throw new Error('[seo] index.html no contiene los marcadores <!--seo--> y <!--/seo-->');
  }

  return (
    template.slice(0, start + startMarker.length) +
    '\n' +
    renderSeoBlock(route) +
    '\n    ' +
    template.slice(end)
  );
}

function buildSitemap() {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PUBLIC_ROUTES.filter((route) => !route.noindex)
    .map(
      (route) => `  <url>
    <loc>${absoluteUrl(route.path)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changeFrequency}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * Genera un HTML inicial por ruta pública con metadatos propios.
 *
 * Esto permite que rastreadores que no ejecutan JavaScript (WhatsApp, Facebook,
 * LinkedIn, Telegram, Discord, X) lean título, descripción e imagen al compartir
 * cualquier enlace. La SPA sigue hidratando sobre ese mismo documento.
 */
export function seoShells() {
  return {
    name: 'credibas-seo-shells',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      const environment = this.environment;
      if (environment && environment.name !== 'client') return;

      const outDir = path.resolve(process.cwd(), environment?.config.build.outDir ?? 'dist/client');
      const indexFile = path.join(outDir, 'index.html');
      const template = await readFile(indexFile, 'utf8');

      for (const route of PUBLIC_ROUTES) {
        const html = injectSeo(template, route);
        if (route.path === '/') {
          await writeFile(indexFile, html);
        } else {
          await writeFile(path.join(outDir, `${route.path.slice(1)}.html`), html);
        }
      }

      await writeFile(path.join(outDir, 'sitemap.xml'), buildSitemap());
      console.log(`[seo] ${PUBLIC_ROUTES.length} documentos HTML + sitemap.xml generados en ${outDir}`);
    },
  };
}

export { SITE_URL };
