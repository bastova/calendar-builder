const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export default {
  ...(process.env.STATIC_EXPORT === 'true' ? { output: 'export' } : {}),
  basePath,
  trailingSlash: true
};
