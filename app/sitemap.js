import { sitePageUrl } from './seo.mjs';
export const dynamic = 'force-static';
export default function sitemap() {
  const url = sitePageUrl();
  return url ? ['', 'privacy-policy/', 'contact/', 'about/', 'faq/', 'terms/'].map(path => ({ url: new URL(path, url).href })) : [];
}
