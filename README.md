# Calendar Layout Studio

Install dependencies with `pnpm install`.

Start the app in one terminal:

```sh
pnpm dev
```

Expose port 3000 in a second terminal:

```sh
pnpm tunnel
```

Share the HTTPS URL printed by ngrok. Keep both processes running and your computer awake. The tunnel requires ngrok to be installed and authenticated on your computer.

For a production server, run `pnpm build` followed by `pnpm start` instead of `pnpm dev`.

### Saved work and local photos

Calendar settings, typography, colors, crops, metadata, printer settings, theme, preview zoom and expanded panels are saved automatically in this browser. Photo contents are never stored in browser storage: the app saves directory handles and relative file references instead. Small Pica previews exist only in memory and are rebuilt from the originals.

If a later session needs folder permission, use **Restore photo access**. Browsers without persistent directory handles ask you to choose the original folder again; unchanged folder selections reconnect to the saved assignments and crops. Keep the originals in place. Large JPEG, PNG and WebP files are decoded within pixel/memory bounds and resized with Pica; the compressed-file processing limit is 256 MiB, with source dimension limits of 150 megapixels and 32,768 pixels per edge.

Saved work belongs to the browser profile and site address. A different localhost port or ngrok hostname has separate storage. Clearing site data removes the saved settings and references.

### SEO and public deployment

Copy `.env.example` to `.env.local`, set `SITE_URL` to the permanent public origin (for example, `https://calendar.example.com`), then rebuild with `pnpm build`. This generates the canonical URL, sitemap entry, social image URLs, and website structured data for that domain. Without `SITE_URL`, the app omits domain-specific URLs and emits an empty sitemap rather than advertising localhost. Keep JavaScript and stylesheet assets accessible to crawlers.

The app includes descriptive metadata, Open Graph and Twitter sharing cards, a generated 1200 × 630 share image, a favicon, server-rendered introductory content, WebApplication structured data, `/robots.txt`, and `/sitemap.xml`. Optionally set `GOOGLE_SITE_VERIFICATION` to your Search Console token before building. After public deployment, verify the property and submit `/sitemap.xml` in Google Search Console; check the live page with URL Inspection. Indexing and rankings depend on the public deployment and search engines.
