import { publicSiteUrl } from './seo.mjs';
export default function sitemap() {
  const url = publicSiteUrl();
  return url ? [{ url: url.href }] : [];
}
