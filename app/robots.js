import { sitePageUrl } from './seo.mjs';
export const dynamic = 'force-static';
export default function robots() {
  const url = sitePageUrl();
  return { rules: { userAgent: '*', allow: '/' }, ...(url ? { sitemap: new URL('sitemap.xml', url).href } : {}) };
}
