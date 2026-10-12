export const siteName = 'Calendar Layout Studio';
export const title = 'Photo Calendar Maker & PDF Export | Calendar Layout Studio';
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
export function siteMetadata(url = publicSiteUrl()) {
  return {
    title, description, applicationName: siteName,
    ...(url ? { metadataBase: url, alternates: { canonical: '/' } } : {}),
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
    openGraph: { title, description, siteName, type: 'website', locale: 'en_US',
      ...(url ? { url: url.href, images: [{ url: '/share-image', width: 1200, height: 630, alt: 'Calendar Layout Studio — custom photo calendars, 3D preview and PDF export' }] } : {}) },
    twitter: { card: url ? 'summary_large_image' : 'summary', title, description,
      ...(url ? { images: ['/share-image'] } : {}) },
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {})
  };
}
export function structuredData(url = publicSiteUrl()) {
  const application = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: siteName,
    description, applicationCategory: 'DesignApplication', operatingSystem: 'Web browser', inLanguage: 'en',
    featureList: ['Custom photo calendar layouts', 'Editable typography and colors', 'Interactive 3D calendar preview', 'PDF preview and download', 'Printer media-fit estimates'],
    ...(url ? { url: url.href } : {})
  };
  return url ? [application, { '@context': 'https://schema.org', '@type': 'WebSite', name: siteName, url: url.href, inLanguage: 'en' }] : [application];
}
