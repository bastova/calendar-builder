'use client';

import { useEffect, useRef, useState } from 'react';

const SCRIPT_SOURCES = [
  ['/calendar/browser-files.js', false],
  ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js', false],
  ['https://cdn.jsdelivr.net/npm/pica@10.0.3/dist/pica.min.js', false],
  ['/calendar/src/scripts/main.js', true]
];

/** Load each dependency before starting the DOM-based studio. */
function loadScript(source, isModule) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source.startsWith('/') ? `${process.env.NEXT_PUBLIC_BASE_PATH || ''}${source}` : source;
    if (isModule) script.type = 'module';
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${source}. Check your connection and reload.`));
    document.body.append(script);
  });
}

/** Mount the preserved interactive studio once after React hydrates its interface. */
export default function CalendarStudio({ markup }) {
  const initialized = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const button = document.getElementById('theme-toggle');
    const root = document.documentElement;
    const sync = () => button?.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
    const toggle = () => {
      const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = theme;
      try { localStorage.setItem('calendar-studio-theme', theme); } catch {}
      sync();
    };
    sync();
    button?.addEventListener('click', toggle);
    return () => button?.removeEventListener('click', toggle);
  }, []);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      for (const [source, isModule] of SCRIPT_SOURCES) await loadScript(source, isModule);
    })().catch(failure => setError(failure.message));
  }, []);
  return <>{error && <p role="alert">{error}</p>}<div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: markup }} /></>;
}
