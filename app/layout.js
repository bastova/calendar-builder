import { siteMetadata } from './seo.mjs';
import Script from 'next/script';
import { analyticsMeasurementId, analyticsBootstrap } from './analytics.mjs';

export const metadata = siteMetadata();
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

/** Provide the application document and the preserved studio stylesheet. */
export default function RootLayout({ children }) {
  const analyticsId = analyticsMeasurementId();
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(() => { let theme; try { theme = localStorage.getItem('calendar-studio-theme'); } catch {} document.documentElement.dataset.theme = theme === 'light' || theme === 'dark' ? theme : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; })();` }} /><link rel="stylesheet" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/calendar/src/styles/main.css`} /></head><body>{children}{analyticsId && <><Script src={`https://www.googletagmanager.com/gtag/js?id=${analyticsId}`} strategy="afterInteractive" /><Script id="google-analytics" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: analyticsBootstrap(analyticsId) }} /></>}</body></html>;
}
