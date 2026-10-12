import { sitePageUrl } from './seo.mjs';
export const dynamic = 'force-static';
export default function sitemap() {
  const url = sitePageUrl();
  return url ? [{ url: url.href }] : [];
}
