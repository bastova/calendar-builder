# Design language

## Direction

Calendar Builder is a quiet, precise workspace for designing photo calendars. Keep the interface neutral and editorial so photographs and calendar previews remain the focus. Use clear hierarchy, compact controls and section spacing, and restrained decoration. Reserve generous space for the 3D artwork preview.

## Color and themes

- Support light and dark themes using the existing CSS custom properties. Remember the user's theme choice.
- Use white and pale gray surfaces in light mode, charcoal surfaces in dark mode, and readable neutral text and borders.
- Orange is the interface accent. Do not use blue, indigo, or purple for primary actions or selected navigation.
- Use `--accent: #f97316`, `--accent-hover: #fb923c`, and `--accent-text: #241005` in both themes. Dark text on orange keeps button labels readable.
- Reserve semantic green and amber for status and warnings. Theme changes must preserve photo, calendar artwork, color proof, and exported PDF colors.

## Buttons and navigation

- Accented buttons are rounded and flat, with a solid orange fill and dark text. Use fully rounded pill ends (`border-radius: 999px`), no border, no gradients, and no shadows.
- Apply this treatment to primary actions and selected navigation: the active Monthly spread / Print map button, active artwork editor tab, selected month, and PDF export action.
- Secondary buttons use neutral surfaces, visible borders, and readable text. Keep them rounded, with no shadows. Do not give every action an orange fill.
- Keep Monthly spread and Print map prominent: bold labels, small supporting icons, and at least 44px touch targets. Use a clear orange selected state. The tab group has no enclosing background or border; its buttons have pill ends and no borders.
- Photo framing actions pair a small outline icon with a visible text label. The aspect-ratio control switches both its lock icon and label with its state; icons are decorative and inherit the button text color.
- Provide visible hover, keyboard focus, selected, and disabled states. Use a 3px orange focus ring with spacing from the control; respect reduced motion.

- Prefer icons for familiar utility actions (reset, zoom, previous/next, parent folder, remove). Icon-only buttons must retain an accessible name and a tooltip. Keep short text beside icons for navigation, folder selection, and PDF export.
- Remove repetitive explanations and implementation details from the workspace. Keep concise instructions where needed, file limits, print caveats, and live errors/status.

## Typography and layout

- Calendar artwork offers a curated Google Fonts selection, self-hosted with licenses and embedded in PDF exports. Keep the interface font unchanged. Offer only styles supplied by each family.
- Use the existing Arial / Helvetica sans-serif stack, modest headings, compact labels, and strong action labels.
- Keep menus and sections compact: roughly 8px control gaps, 10–14px panel padding, 32px inputs, and 34–36px desktop utility buttons. Keep primary view tabs and touch controls at least 44px tall.
- Use a horizontal calendar toolbar instead of a permanent configuration sidebar. Keep year, dimensions, week start and guides immediately available; put secondary settings in an expandable group.
- On wide screens, place the large 3D stage beside a 390–430px scrollable artwork inspector. Group secondary settings in named accordions. Keep photo framing and active editing controls directly available.
- Preserve a large 3D stage (74vh, bounded to 540–1000px on desktop; 520px on mobile). At narrower widths, move the inspector below the stage and use side-by-side editor content when space permits.
- Print view uses a dashboard: PDF actions and geometry on one side, paper simulation and printer fit on the other. Put duplex/assembly details in an expandable section.
- On small screens, let controls wrap and give primary navigation enough width to remain readable and easy to tap.

- Font-style controls are small borderless text buttons. Render R normally, B in bold, I in italic, and BI in bold italic; retain accessible style names, tooltips, and a clear selected state.
- Typography uses compact role cards, with font family and size above segmented style/alignment controls and a square color swatch. Keep color controls square and spacing values beside their labels. Flat calendar previews offer fit and zoom controls with scrollable inspection.

## Local persistence

- Persist settings, photo references and crops, never photo contents. Store directory handles where supported; offer Restore photo access when browser permission expires. Browsers without directory handles require reselecting the original folder.
- Process large originals through bounded decoding and Pica resizing; retain small previews in memory only. Avoid obsolete file-size explanations.

## Print estimates

- Clearly label the color panels as generic paper simulations, not calibrated printer previews. Printer selection changes media-fit checks and workflow guidance; never invent device-specific color accuracy.
- Keep manufacturer source links for each printer. Distinguish nominal sheet fit, known printable image area, and roll-width-only checks. Include bleed and the PDF export’s crop-mark fallback slug. Unsupported custom sizes and media settings require confirmation.

## Before changing the UI

Read this file first. Reuse these tokens and patterns, check both themes and responsive states, and keep visual choices consistent with the user's latest instructions.
