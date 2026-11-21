import type { Plugin } from 'vite';
import type { SeoRoute } from '../src/shared/seo-routes.mjs';

export function renderSeoBlock(route: SeoRoute): string;
export function seoShells(): Plugin;
