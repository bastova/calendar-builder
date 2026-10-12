import { prepareCalendarAssets } from './app/calendar-assets.mjs';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export default (phase) => {
  const assets = phase === 'phase-production-build' ? prepareCalendarAssets() : null;
  return {
  ...(process.env.STATIC_EXPORT === 'true' ? { output: 'export' } : {}),
  basePath,
  env: {
    NEXT_PUBLIC_CALENDAR_MAIN: assets?.main || '/calendar/src/scripts/main.js',
    NEXT_PUBLIC_CALENDAR_VERSION: assets?.version || 'dev'
  },
  trailingSlash: true
  };
};
