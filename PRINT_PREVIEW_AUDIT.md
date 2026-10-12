# Print preview audit

Reviewed October 11, 2026.

## What can be trusted

The PDF and its on-screen PDF viewer share the actual generated document. The draft viewer uses lower-resolution photo previews and explicit missing-photo placeholders; full export rereads originals and prepares bounded print rasters. Calendar grids use shared layout coordinates and vector PDF text. Neither document is a certified color proof.

The unlit paper panels reproducibly apply the stated linear-sRGB calculation to a sampled artwork raster. Their luminance and tonal-span statistics describe those pixels, not a printer's measured brightness, contrast, gamut, ink density or color error. Selecting a printer does not change the paper color transform. The 3D scene adds lighting, reflections and tone mapping and cannot serve as a color reference.

## Findings and corrections

- The original selector offered one Epson model and a generic commercial condition. The catalog now has 45 named models/series plus an unspecified-provider option, grouped by workflow. Each entry retains its manufacturer source and research date in `public/calendar/src/scripts/printers.js`.
- The old fit estimate omitted the export's automatic crop-mark slug when page-box metadata is unsupported. Shared PDF geometry now accounts for this fallback, bleed, explicit marks and saddle imposition.
- Sheet capacity, printable image area and roll width are distinct. A nominal fit is conditional, not an assertion that a printer can print every pixel or duplex the selected stock. Known image-area limits are checked separately; unknown limits remain unknown.
- A3 and Ledger are separate sheet choices; their maximum axes are not combined into an imaginary sheet.
- FOGRA51/52 are not assumed for every commercial device. A digital press model does not establish its calibration, substrate or output condition.
- Current opening/closing spreads now compare the selected solid color rather than the last monthly photograph.
- The interface explicitly identifies a generic paper simulation and links the selected manufacturer's specifications.

## Limits

No printer/paper ICC profiles are loaded, no monitor calibration is verified, and no physical test prints were measured. All printer targets intentionally share the same editable paper assumptions. There is no evidence to justify device-specific color transforms or accuracy scores. Published media specifications alone cannot provide that evidence.

Sheet references do not enumerate every custom length, feeder, firmware, region, stock weight or finishing option. Exceeding a reference prompts confirmation; roll targets check only nominal width. PDF raster caps may reduce photo resolution at large sizes. The draft PDF is for layout review, not production print quality.

To judge final colors, use the exact ink/toner, printer and paper ICC profile in a color-managed application, a calibrated display and a physical proof under controlled viewing conditions. Obtain the output profile and RIP instructions from the commercial provider; do not automatically convert every commercial job to a generic CMYK space.

## Validation

`pnpm test` checks all catalog selections and legacy settings, media rotation, separate A3/Ledger sizes, sheet versus image-area limits, roll/unknown outcomes, paper-transform identity and neutrality, alpha preservation, preview metadata and selector rendering. Actual jsPDF 4.2.1 page dimensions were compared with the shared geometry for wire/saddle and explicit/fallback marks. `pnpm build` verifies application compilation.

These checks validate software behavior; they do not establish measured printer color accuracy.

## References

- [Adobe: proofing colors](https://helpx.adobe.com/photoshop/using/proofing-colors.html)
- [Adobe: physical proof accuracy](https://helpx.adobe.com/photoshop/desktop/print/print-a-hard-proof.html)
- [Epson ET-8550](https://epson.com/For-Work/Printers/Inkjet/EcoTank-Photo-ET-8550-All-in-One-Wide-format-Supertank-Printer/p/C11CJ21201)
- [Canon PRO-1100](https://www.usa.canon.com/shop/p/imageprograf-pro-1100)
- [HP Indigo 7K+: sheet versus image area](https://www.hp.com/us-en/industrial-printers/indigo-digital-presses/commercial-digital-presses/7k-plus-printing-press/faq.html)
- All remaining manufacturer links are stored beside their corresponding catalog entries.
