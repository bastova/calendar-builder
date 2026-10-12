import { publicSiteUrl } from './seo.mjs';
export default function robots() {
  const url = publicSiteUrl();
  return { rules: { userAgent: '*', allow: '/' }, ...(url ? { sitemap: new URL('/sitemap.xml', url).href } : {}) };
}
