# Calendar Builder

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

### Visit analytics on GitHub Pages

Create a Google Analytics 4 property and a Web data stream for your GitHub Pages URL. Copy the stream's Measurement ID (starts with `G-`). In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and add a repository variable named `GOOGLE_ANALYTICS_ID` with that ID. Run **Actions → Deploy GitHub Pages → Run workflow**, or push to `main`, to rebuild and deploy.

Open the deployed site and check the property's **Realtime** report to verify visits arrive. Analytics loads after the interface becomes interactive and uses Google's automatic page-view tracking. No custom photo, calendar, or editor data is sent by this integration. Without a valid ID, no Analytics scripts load.

For a local production build, set `GOOGLE_ANALYTICS_ID` in `.env.local` before building; leave it unset during development to avoid recording test visits. The measurement ID is public configuration, not a secret.

### Contact form

The Contact page uses `@formspree/react` with form ID `mkjovaer`. Submissions go directly to `https://formspree.io/f/mkjovaer`, so this works with static hosting and requires no server route or email secret. Manage the recipient email, domain restrictions, spam protection, and notification settings in the Formspree dashboard. The form also has a native POST action for use without JavaScript.
