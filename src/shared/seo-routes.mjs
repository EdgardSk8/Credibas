/**
 * Fuente única de verdad para SEO y metadatos sociales.
 *
 * Lo consumen:
 *  - scripts/vite-plugin-seo.mjs  (genera HTML estático por ruta y sitemap)
 *  - src/client/lib/seo.ts        (actualiza metadatos al navegar en la SPA)
 *
 * Si cambia el dominio, define `SITE_URL` en el entorno de build (por defecto
 * https://credibas.pages.dev) y actualiza public/robots.txt.
 */

const DEFAULT_SITE_URL = 'https://credibas.pages.dev';

function resolveSiteUrl() {
  if (typeof process !== 'undefined' && process.env) {
    const configured = process.env.SITE_URL || process.env.APP_URL;
    if (configured) return configured.replace(/\/+$/, '');
  }
  return DEFAULT_SITE_URL;
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = 'Credibas';
export const DEFAULT_IMAGE = '/og-image.png';
export const IMAGE_WIDTH = 1200;
export const IMAGE_HEIGHT = 630;
export const LOCALE = 'es_NI';
export const LOGO_PATH = '/android-chrome-512x512.png';

export const PUBLIC_ROUTES = [
  {
    path: '/',
    title: 'Credibas — Controla tus créditos. Domina tus finanzas.',
    description:
      'Gestiona clientes, préstamos y cuotas; pagos con distribución automática y control de caja, cartera y mora. Cada operación auditada. Prueba gratis 15 días.',
    priority: 1.0,
    changeFrequency: 'weekly',
    image: '/og/inicio.png?v=1',
    imageAlt: 'Credibas — controla tus créditos y finanzas',
    schema: 'home',
  },
  {
    path: '/funcionalidades',
    title: 'Funcionalidades — Credibas',
    description:
      'Clientes, préstamos con calendario verificable, cuotas, pagos, cobros, caja y reportes reales en una sola plataforma para tu negocio financiero.',
    priority: 0.9,
    changeFrequency: 'monthly',
    image: '/og/funcionalidades.png?v=1',
    imageAlt: 'Funcionalidades de Credibas',
    schema: 'page',
  },
  {
    path: '/precios',
    title: 'Planes y precios — Credibas',
    description:
      'Compara los planes Starter, Professional y Business de Credibas. Precios mensuales y anuales con límites claros de usuarios, clientes y cartera.',
    priority: 0.9,
    changeFrequency: 'monthly',
    image: '/og/precios.png?v=1',
    imageAlt: 'Planes y precios de Credibas',
    schema: 'pricing',
  },
  {
    path: '/contacto',
    title: 'Contacto — Credibas',
    description:
      'Escríbenos para resolver dudas sobre Credibas, solicitar una demo o revisar la facturación de tu negocio financiero.',
    priority: 0.6,
    changeFrequency: 'monthly',
    image: '/og/contacto.png?v=1',
    imageAlt: 'Contacto — Credibas',
    schema: 'page',
  },
  {
    path: '/terminos',
    title: 'Términos de servicio — Credibas',
    description: 'Condiciones de uso de la plataforma Credibas para la gestión de préstamos, cartera y cobros.',
    priority: 0.3,
    changeFrequency: 'yearly',
    image: '/og/terminos.png?v=1',
    imageAlt: 'Términos de servicio — Credibas',
    schema: 'page',
  },
  {
    path: '/privacidad',
    title: 'Política de privacidad — Credibas',
    description:
      'Cómo tratamos los datos de tu cuenta, de tu negocio y de los clientes que registras en Credibas.',
    priority: 0.3,
    changeFrequency: 'yearly',
    image: '/og/privacidad.png?v=1',
    imageAlt: 'Política de privacidad — Credibas',
    schema: 'page',
  },
  {
    path: '/login',
    title: 'Iniciar sesión — Credibas',
    description: 'Accede a tu cuenta de Credibas para administrar tu cartera.',
    priority: 0.2,
    changeFrequency: 'yearly',
    schema: 'page',
    noindex: true,
  },
  {
    path: '/registro',
    title: 'Crear cuenta — Credibas',
    description: 'Crea tu cuenta de Credibas y comienza tu prueba de 15 días.',
    priority: 0.4,
    changeFrequency: 'yearly',
    schema: 'page',
    noindex: true,
  },
  {
    path: '/recuperar-contrasena',
    title: 'Recuperar acceso — Credibas',
    description: 'Restablece la contraseña de tu cuenta de Credibas.',
    priority: 0.1,
    changeFrequency: 'yearly',
    schema: 'page',
    noindex: true,
  },
  {
    path: '/restablecer-contrasena',
    title: 'Nueva contraseña — Credibas',
    description: 'Define una nueva contraseña para tu cuenta de Credibas.',
    priority: 0.1,
    changeFrequency: 'yearly',
    schema: 'page',
    noindex: true,
  },
  {
    path: '/verificar-correo',
    title: 'Verificar correo — Credibas',
    description: 'Confirma tu dirección de correo para activar tu cuenta de Credibas.',
    priority: 0.1,
    changeFrequency: 'yearly',
    schema: 'page',
    noindex: true,
  },
  {
    path: '/invitacion',
    title: 'Invitación — Credibas',
    description: 'Acepta la invitación para colaborar en un negocio dentro de Credibas.',
    priority: 0.1,
    changeFrequency: 'yearly',
    schema: 'page',
    noindex: true,
  },
];

export function absoluteUrl(pathname = '/') {
  return new URL(pathname, SITE_URL).toString();
}

export function findRoute(pathname) {
  const clean = pathname !== '/' ? pathname.replace(/\/+$/, '') : '/';
  return PUBLIC_ROUTES.find((route) => route.path === clean) ?? null;
}

const FAQ = [
  {
    question: '¿Credibas es un sistema de préstamos o un Excel mejorado?',
    answer:
      'Es una plataforma completa: registra clientes, crea préstamos con calendario de cuotas, aplica pagos con distribución automática, controla caja y genera reportes reales de cartera y mora.',
  },
  {
    question: '¿Puedo usarlo si presto en córdobas y dólares?',
    answer:
      'Sí. Cada préstamo y pago conserva su moneda original. Los reportes nunca suman monedas distintas como si fueran iguales; puedes analizar tu cartera por moneda.',
  },
  {
    question: '¿Cómo se calculan las cuotas?',
    answer:
      'El motor financiero soporta interés plano, cuota fija y saldo insoluto, con frecuencias diaria, semanal, quincenal, mensual o personalizada. Todos los importes se calculan en centavos y con reglas de redondeo explícitas.',
  },
  {
    question: '¿Puedo trabajar con cobradores?',
    answer:
      'Sí. Asigna clientes a cobradores, recibe una agenda de cuotas vencidas y próximas, registra gestiones, promesas de pago y da seguimiento desde un solo lugar.',
  },
  {
    question: '¿Qué pasa si necesito reestructurar un préstamo?',
    answer:
      'Credibas nunca reescribe el historial. Genera una nueva versión del calendario sobre el saldo pendiente y deja registro de auditoría de quién lo hizo y por qué.',
  },
  {
    question: '¿Mis datos están aislados de otros negocios?',
    answer:
      'Cada organización es un espacio independiente. La organización activa se resuelve desde tu sesión y membresía autenticada, nunca desde un identificador enviado por el navegador.',
  },
];

export function buildJsonLd(route) {
  const organization = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl(LOGO_PATH),
      width: 512,
      height: 512,
    },
  };

  const website = {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    inLanguage: 'es-NI',
    publisher: { '@id': organization['@id'] },
  };

  const pageUrl = absoluteUrl(route.path);
  const webPage = {
    '@type': 'WebPage',
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name: route.title,
    description: route.description,
    inLanguage: 'es-NI',
    isPartOf: { '@id': website['@id'] },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: absoluteUrl(route.image ?? DEFAULT_IMAGE),
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
    },
  };

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/` },
      ...(route.path === '/'
        ? []
        : [{ '@type': 'ListItem', position: 2, name: route.breadcrumb ?? route.title.split(' — ')[0], item: pageUrl }]),
    ],
  };

  const software = {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Loan management software',
    operatingSystem: 'Web',
    url: `${SITE_URL}/`,
    description:
      'Plataforma para administrar préstamos, clientes, cuotas, pagos, cobros, caja y reportes de cartera.',
  };

  if (route.schema === 'home') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        organization,
        website,
        webPage,
        software,
        {
          '@type': 'FAQPage',
          '@id': `${SITE_URL}/#faq`,
          isPartOf: { '@id': website['@id'] },
          mainEntity: FAQ.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer },
          })),
        },
      ],
    };
  }

  if (route.schema === 'pricing') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        organization,
        website,
        webPage,
        {
          ...software,
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'USD',
            lowPrice: '9.90',
            highPrice: '49.90',
            offerCount: 3,
            offers: [
              { '@type': 'Offer', name: 'Starter', price: '9.90', priceCurrency: 'USD' },
              { '@type': 'Offer', name: 'Professional', price: '24.90', priceCurrency: 'USD' },
              { '@type': 'Offer', name: 'Business', price: '49.90', priceCurrency: 'USD' },
            ],
          },
        },
        breadcrumb,
      ],
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [organization, website, webPage, breadcrumb],
  };
}
