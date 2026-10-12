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
