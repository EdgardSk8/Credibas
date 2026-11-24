export interface SeoRoute {
  path: string;
  title: string;
  description: string;
  priority: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  schema: 'home' | 'pricing' | 'page';
  noindex?: boolean;
  image?: string;
  imageAlt?: string;
  breadcrumb?: string;
}

export const SITE_URL: string;
export const SITE_NAME: string;
export const DEFAULT_IMAGE: string;
export const IMAGE_WIDTH: number;
export const IMAGE_HEIGHT: number;
export const LOCALE: string;
export const LOGO_PATH: string;

export const PUBLIC_ROUTES: SeoRoute[];

export function absoluteUrl(pathname?: string): string;
export function findRoute(pathname: string): SeoRoute | null;
export function buildJsonLd(route: SeoRoute): Record<string, unknown>;
