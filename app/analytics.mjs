/** Only accept GA4 web measurement IDs before embedding one in a script. */
export function analyticsMeasurementId(value = process.env.GOOGLE_ANALYTICS_ID) {
  const id = typeof value === 'string' ? value.trim() : '';
  return /^G-[A-Z0-9]+$/.test(id) ? id : null;
}

export function analyticsBootstrap(id) {
  return `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', ${JSON.stringify(id)});`;
}
