export const siteName = 'Calendar Builder';
export const title = 'Photo Calendar Maker & PDF Export | Calendar Builder';
export const description = 'Create custom photo calendars with editable fonts, colors and layouts. Inspect a 3D preview, plan printing, and preview your calendar PDF before downloading.';

/** Configure a stable public origin instead of publishing localhost or temporary tunnels. */
export function publicSiteUrl(value = process.env.SITE_URL) {
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SITE_URL must be an HTTP(S) origin, e.g. https://calendar.example.com');
  }
  return url;
}
export function sitePageUrl(url = publicSiteUrl()) {
  return url ? new URL(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`, url) : null;
}
export function siteMetadata(url = publicSiteUrl()) {
  const pageUrl = sitePageUrl(url);
  const imageUrl = pageUrl ? new URL('share-image.png', pageUrl).href : null;
  return {
    title, description, applicationName: siteName,
    ...(url ? { metadataBase: url, alternates: { canonical: pageUrl.href } } : {}),
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
    openGraph: { title, description, siteName, type: 'website', locale: 'en_US',
      ...(url ? { url: pageUrl.href, images: [{ url: imageUrl, width: 1200, height: 630, alt: 'Calendar Builder — custom photo calendars, 3D preview and PDF export' }] } : {}) },
    twitter: { card: url ? 'summary_large_image' : 'summary', title, description,
      ...(url ? { images: [imageUrl] } : {}) },
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {})
  };
}
export function structuredData(url = publicSiteUrl()) {
  url = sitePageUrl(url);
  const application = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: siteName,
    description, applicationCategory: 'DesignApplication', operatingSystem: 'Web browser', inLanguage: 'en',
    featureList: ['Custom photo calendar layouts', 'Editable typography and colors', 'Interactive 3D calendar preview', 'PDF preview and download', 'Printer media-fit estimates'],
    ...(url ? { url: url.href } : {})
  };
  return url ? [application, { '@context': 'https://schema.org', '@type': 'WebSite', name: siteName, url: url.href, inLanguage: 'en' }] : [application];
}
