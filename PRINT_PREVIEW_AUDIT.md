# Print preview audit

## Findings and correction

The previous printer selector only changed media-fit checks. Its generic paper-white, black-floor and chroma filter was identical for every device. Those pixels were not printer estimates. Manufacturer sheet dimensions and ink counts cannot determine a color transform.

The default is now ICC soft proof. Users assign an exact output profile independently to each printer and paper category. LittleCMS 2.16 (lcms-wasm 1.0.5, MIT, self-hosted assets) creates an sRGB → output-condition → sRGB proofing transform. Rendering intent is relative colorimetric; proof intent is absolute colorimetric, simulating paper white and ink black. No additional heuristic filter is applied. RGB, CMYK and gray output profiles are accepted; monitor, camera and device-link profiles are rejected. Invalid headers, sizes, tag bounds and unusable transforms are rejected.

Without an assigned profile, the corresponding proof and metrics are unavailable. The old generic filter is available only under “Illustrative paper filter.” Printer selection never fabricates a device gamut. Profiles are stored locally in IndexedDB, separately from photo references; photo contents remain unpersisted. No vendor ICC files are bundled, and no generic commercial reference condition is silently assigned to a named press.

## Scope and limitations

- Input is the browser-decoded sRGB preview raster, not the original image’s embedded profile processed independently. Results depend on browser decoding and display color management.
- The user must match the profile to printer, ink/toner, exact stock, media mode, print quality and RIP/driver configuration. The app validates ICC structure, not that physical match. Coated/uncoated are organizational slots, not profile specifications.
- The display is not verified as calibrated. Unlit proofs are preferable to 3D lighting. A physical proof remains necessary.
- These transforms affect previews only. Exported PDFs remain RGB, not PDF/X or CMYK-converted. Printing must use an appropriate external color-managed workflow. Preview luminance statistics describe sampled images, not measured printer performance.
- Existing manufacturer sheet/image-area/roll-width fit checks still include bleed and crop-mark slug. They do not certify feed compatibility, duplex support or finish quality.

## Sources researched

- [Adobe: proofing colors](https://helpx.adobe.com/photoshop/using/proofing-colors.html): custom output profiles, paper/black simulation and monitor limitations.
- [Epson ET-8550 support](https://www.epson.com.au/support/product/et-8550_r/): downloadable supplemental profiles and profiles supplied with drivers.
- [Canon: printing with ICC profiles](https://ij.manual.canon/ij/webmanual/PrinterDriver/M/PRO-300%20series/1.0/EN/PPG/dg-c_color_correction03.html): input/output profiles, special paper and correct ColorSync settings.
- [LittleCMS WASM source/API](https://github.com/mattdesl/lcms-wasm): proofing transform API and MIT licensing.

## Validation

Automated tests cover bounded generic filtering, ICC validation, real LittleCMS proofing with synthetic output-profile fixtures of different gamuts, differing pixels, alpha preservation, separate printer/paper assignments, cleanup, catalog and media geometry. Synthetic fixtures are test conditions only, never offered as printer presets.

Browser validation used the operating system’s Generic CMYK profile solely as a temporary test: import, proof pixels, printer isolation, reload persistence and removal succeeded. It was removed afterwards; it is not a valid ET-8550 profile and is not shipped. Production build succeeds.
