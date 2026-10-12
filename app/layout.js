import { siteMetadata } from './seo.mjs';

export const metadata = siteMetadata();

/** Provide the application document and the preserved studio stylesheet. */
export default function RootLayout({ children }) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(() => { let theme; try { theme = localStorage.getItem('calendar-studio-theme'); } catch {} document.documentElement.dataset.theme = theme === 'light' || theme === 'dark' ? theme : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; })();` }} /><link rel="stylesheet" href="/calendar/src/styles/main.css" /></head><body>{children}</body></html>;
}
