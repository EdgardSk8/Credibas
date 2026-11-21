import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DEFAULT_IMAGE,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  LOCALE,
  SITE_NAME,
  absoluteUrl,
  buildJsonLd,
  findRoute,
} from '@shared/seo-routes.mjs';

const PRIVATE_TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/app$/, title: 'Panel' },
  { match: /^\/app\/clientes/, title: 'Clientes' },
  { match: /^\/app\/prestamos/, title: 'Préstamos' },
  { match: /^\/app\/simulador/, title: 'Simulador de crédito' },
  { match: /^\/app\/cuotas/, title: 'Cuotas' },
  { match: /^\/app\/pagos/, title: 'Pagos' },
  { match: /^\/app\/cobros/, title: 'Cobros' },
  { match: /^\/app\/caja/, title: 'Caja' },
  { match: /^\/app\/reportes/, title: 'Reportes' },
  { match: /^\/app\/configuracion/, title: 'Configuración' },
  { match: /^\/app\/suscripcion/, title: 'Suscripción' },
  { match: /^\/admin/, title: 'Administración' },
  { match: /^\/onboarding/, title: 'Configura tu negocio' },
];

function setMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

function setJsonLd(route: ReturnType<typeof findRoute>): void {
  document.head.querySelectorAll('script[data-seo-jsonld]').forEach((node) => node.remove());
  if (!route) return;

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.dataset.seoJsonld = 'true';
  script.textContent = JSON.stringify(buildJsonLd(route));
  document.head.appendChild(script);
}

/**
 * Aplica título, descripción, canonical, Open Graph, Twitter y JSON-LD al navegar.
 *
 * Los rastreadores sociales reciben estos mismos datos desde el HTML inicial
 * generado en build (ver scripts/vite-plugin-seo.mjs); esta función mantiene la
 * coherencia cuando el usuario navega dentro de la SPA.
 */
export function applySeo(pathname: string): void {
  const route = findRoute(pathname);
  const privateTitle = PRIVATE_TITLES.find((entry) => entry.match.test(pathname))?.title;
  const isPrivate = pathname.startsWith('/app') || pathname.startsWith('/admin') || pathname === '/onboarding';
  const isUnknown = !route && !privateTitle;

  const title = route?.title ?? (privateTitle ? `${privateTitle} — ${SITE_NAME}` : `Página no encontrada — ${SITE_NAME}`);
  const description =
    route?.description ??
    (privateTitle
      ? `${privateTitle} en Credibas: gestión de préstamos, cuotas, pagos y cartera.`
      : 'La página que buscas no existe o cambió de dirección.');

  const url = absoluteUrl(pathname === '/' ? '/' : pathname.replace(/\/+$/, ''));
  const image = absoluteUrl(route?.image ?? DEFAULT_IMAGE);
  const robots = route?.noindex || isPrivate || isUnknown ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
  const imageAlt = `${SITE_NAME} — Gestión de créditos y cartera`;

  document.title = title;
  setMeta('name', 'description', description);
  setMeta('name', 'robots', robots);
  setCanonical(url);

  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', SITE_NAME);
  setMeta('property', 'og:locale', LOCALE);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:image', image);
  setMeta('property', 'og:image:secure_url', image);
  setMeta('property', 'og:image:type', 'image/png');
  setMeta('property', 'og:image:width', String(IMAGE_WIDTH));
  setMeta('property', 'og:image:height', String(IMAGE_HEIGHT));
  setMeta('property', 'og:image:alt', imageAlt);

  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', image);
  setMeta('name', 'twitter:image:alt', imageAlt);

  setJsonLd(route);
}

export function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    applySeo(pathname);
  }, [pathname]);

  return null;
}
