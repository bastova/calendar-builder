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
- Reset Layout uses the same secondary icon-and-text button treatment as Choose photo folder, including full-width sizing on phones.
- Secondary buttons use neutral surfaces, visible borders, and readable text. Keep them rounded, with no shadows. Do not give every action an orange fill.
- Keep Monthly spread and Print map prominent: bold labels, small supporting icons, and at least 44px touch targets. Use a clear orange selected state. The tab group has no enclosing background or border; its buttons have pill ends and no borders.
- Place Share & Import beside Print map in the top navigation as a neutral dropdown containing the ZIP sharing and folder import actions.
- Photo framing actions pair a small outline icon with a visible text label. The aspect-ratio control switches both its lock icon and label with its state; icons are decorative and inherit the button text color.
- Provide visible hover, keyboard focus, selected, and disabled states. Use a 3px orange focus ring with spacing from the control; respect reduced motion.

- Prefer icons for familiar utility actions (reset, zoom, previous/next, parent folder, remove). Icon-only buttons must retain an accessible name and a tooltip. Keep short text beside icons for navigation, folder selection, and PDF export.
- Omit decorative headlines and eyebrow copy from editor menus. Back-cover Image framing stays permanently open with no divider below it.
- Remove repetitive explanations and implementation details from the workspace. Keep concise instructions where needed, file limits, print caveats, and live errors/status.

## Typography and layout

- Calendar artwork font sizes stay at their configured point sizes when page dimensions change, including holiday labels. Never automatically shrink typography to fit; report overflow so users can adjust their layout.
- Calendar artwork offers a curated Google Fonts selection, self-hosted with licenses and embedded in PDF exports. Keep the interface font unchanged. Offer only styles supplied by each family.
- Use the existing Arial / Helvetica sans-serif stack, modest headings, compact labels, and strong action labels.
- Keep menus and sections compact: roughly 8px control gaps, 10–14px panel padding, 32px inputs, and 34–36px desktop utility buttons. Keep primary view tabs and touch controls at least 44px tall.
- Use a horizontal calendar toolbar instead of a permanent configuration sidebar. Keep year, dimensions and week start immediately available, with Binding beside Week begins, followed by Opening blank spread and Closing blank spread checkboxes and the bottom-aligned Holidays menu on desktop. Align the stacked checkboxes to the full height of the adjacent labeled controls. Anchor the Holidays menu below its own button. Do not show a measurement guides checkbox on desktop or mobile.
- On wide screens, place the large 3D stage beside a 390–430px scrollable artwork inspector. Group secondary settings in named accordions. Keep photo framing and active editing controls directly available.
- Keep Glossy / Satin / Matte paper finish and a roughness slider visible in the 3D preview toolbar. Binding belongs in Calendar settings beside Week begins, including mobile Setup. Put Paper weight & thickness beside Paper finish in the preview controls on desktop and mobile.
- Preserve a large 3D stage (74vh, bounded to 540–1000px on desktop). On phones use a viewport-relative stage (44svh, 280–540px) so controls and navigation remain reachable.
- Print view uses a dashboard: PDF actions and geometry on one side, paper simulation and printer fit on the other. Put duplex/assembly details in an expandable section.
- On phones (up to 720px), use focused Preview, Edit and Print screens with fixed bottom navigation ordered Preview, Setup, Edit, Print, Info and a separate native Setup dialog. Show one task at a time; avoid stacking the entire desktop workspace. Reuse the same controls and state when resizing.
- Use at least 44px mobile touch controls, 16px form text, readable 12–14px labels, safe-area padding and a horizontally scrollable month strip. Keep finish and roughness visible in the preview toolbar; allow two organized rows on phones. Avoid page-wide horizontal scrolling at 320px.

- Font-style controls are small borderless text buttons. Render R normally, B in bold, I in italic, and BI in bold italic; retain accessible style names, tooltips, and a clear selected state.
- Layout modifier sections share the same accordion headings, row spacing, left-aligned labels and right-aligned controls. Typography uses consistent role cards with Font, Size / Color, Style and Align rows. Keep square color swatches and numeric fields the same size throughout; desktop controls are 34px and mobile controls are at least 44px. Flat calendar previews offer fit and zoom controls with scrollable inspection. Layout modifier and Back cover share the same zoom toolbar: minus, percentage, plus, and a visible Fit button, with identical spacing and mobile touch sizes.

- Layout modifier keeps its flat calendar preview and zoom controls stationary above an independently scrollable settings area on desktop and phones. Reserve enough space for the settings; fit the preview to its available viewport height.

- Month and year containers have independent horizontal and vertical padding in points. Grouped containers grow in width with padding; the header row reserves padded text height. Padding never changes the configured font size.

- Month and year containers each have four independent corner radii and an option to round only their outer-facing ends. Their facing borders can inherit each container’s border, use a custom color/width, or be hidden. Apply these options to both separated and grouped headers and preserve older shared-radius settings.

- Weekday headers support independent top-left, top-right, bottom-left and bottom-right radii, applied to every cell or only the row’s outer ends. Internal weekday borders have independent visibility, color and width. A continuous header band uses outer-only top corner rounding, square bottom corners and no internal borders, matching the printed-calendar reference.

- Grid styling supports segmented lines with end gaps, optional outer boundaries, separate weekday fills and borders, rounded grid and individual cell corners, cell spacing, and a second outline optionally enclosing weekday headings. Month and year containers have independent fill, border and radius controls. Layout background offers a color or a dedicated image with the existing photo-folder and crop workflow; cell/header fills can be disabled to reveal it. Keep geometry shared between Canvas and vector PDF; export background photos from bounded original decoding with bleed.

- Holiday labels wrap on word boundaries; never split words across lines. Keep configured sizes and report words that cannot fit. Offer top/bottom holiday placement independently of date alignment while reserving space between the two. Month and year can retain separate containers or form one left/center/right-aligned group with configurable point spacing; grouped containers follow their text widths.

- Date-number shapes are optional calendar artwork: offer circle, diamond, star, oval, square and squircle fills with a color and point-size control. Follow date alignment, reserve space beside holiday labels, and use the same vector outlines in previews and PDF exports.

- Organize Layout modifier by element: Month & year, Weekday headings, Date cells, Leading & trailing cells, Miniature calendars, Artwork details, Layout background, Page spacing, and Opening & closing spreads. Keep each element’s typography, colors, alignment and spacing together. Date cells include grid styling, date and holiday typography, padding, holiday spacing, and date-number shapes. Keep Auto-contrast holiday text on the Holiday names card; put the shared blank-spread color and help in Opening & closing spreads.

- Back cover uses Dynamic and Image source tabs. Show only the selected source’s settings; image framing actions use icons with short text labels. Keep source images and dynamic settings when switching tabs.

- Opening and closing filler spreads have four independent faces: opening top/bottom and closing top/bottom. Each can use its own color or a dedicated image with the standard photo-folder, restore and crop workflow. Unset colors inherit the shared fallback; required booklet padding remains separate.

- Monthly artwork details have independent horizontal alignment (or inherited per-field alignment), top/middle/bottom block alignment, horizontal/vertical padding, an optional transparent background, border color/width and four corner radii. Align the whole text stack within its padded area without shrinking typography; preserve unstyled containers in older calendars.

- Monthly artwork details can appear below the full month/year heading, below the month or year container, or at the page bottom. Reserve an adjustable text area, retain configured typography, and offer field visibility controls. Edit front-cover credits through Image picker; the generated back cover can include these as an optional card with or without the cover thumbnail. Its optional background image sits beneath cards and text and uses bounded original-file export.

- Opening and closing blank spreads can be included independently. Keep both enabled for older saved calendars. Navigation, previews, sheet counts and PDF exports must follow the selection; identify any mandatory saddle-stitch padding separately. Reuse the checkboxes in mobile Setup.

- Every layout background color offers an explicit Transparent option, including date/holiday/adjacent cells, month/year and weekday containers, date-number fills, full-layout and back-cover backgrounds/cards, filler faces and booklet fallback. Keep the selected color when toggling transparency. Skip transparent fill layers while retaining borders and text; Canvas and PDF should reveal underlying artwork. Empty page areas represent unprinted paper.

- Assigning an optional layout background, back-cover background or filler image enables its corresponding image setting after the assignment succeeds. Restoration and crop edits must preserve an explicit disabled setting. Show the month spread after assigning its layout background; preserve configured cell and header fills.

- Numeric fields preserve unfinished drafts while typing. Apply valid values live, enforce limits only on blur or Enter, and restore the last accepted value for empty or invalid drafts. Apply this consistently in document settings, Layout modifier and Back cover; keep validation in stored data and geometry.

## Local persistence

- Persist settings, photo references and crops, never photo contents. Store directory handles where supported; offer Restore photo access when browser permission expires. Browsers without directory handles require reselecting the original folder.
- Process large originals through bounded decoding and Pica resizing; retain small previews in memory only. Avoid obsolete file-size explanations.

## Print estimates

- Default to ICC soft proof using an exact user-assigned printer / ink / paper output profile. Save profiles per printer and paper. Without a profile, show unavailable rather than invented device colors. Keep the generic illustrative paper filter explicitly optional. Never claim a calibrated display or physical-print accuracy.
- Keep manufacturer source links for each printer. Distinguish nominal sheet fit, known printable image area, and roll-width-only checks. Include bleed and the PDF export’s crop-mark fallback slug. Unsupported custom sizes and media settings require confirmation.

## Before changing the UI

Read this file first. Reuse these tokens and patterns, check both themes and responsive states, and keep visual choices consistent with the user's latest instructions.

## Information pages

- Show Privacy Policy, Contact, About, and FAQ links in a quiet desktop footer. On phones, show this footer in a dedicated Info screen selected from the five-item bottom navigation.
- Information pages use a readable single column, shared theme colors, orange keyboard focus, and a clear link back to the calendar.

- Group footer links under Explore, Support, and Privacy & usage. Include the linked brand, a short description, copyright, Terms of Use, Contact, and Back to top. Keep the expanded footer in mobile Info.

- Omit the photo-processing badge, Report an issue, GitHub project, and Browser storage links from the footer.

- Size the footer to its content with normal padding, without fixed heights or empty reserved space. Keep editor accordion growth contained in the inspector rather than adding space to the footer.

- Above 720px, reserve a stable artwork inspector height (the bounded 3D stage height plus 140px). Expanded editor accordions scroll inside the inspector and must not move the footer, including the stacked layout at narrower desktop widths.

- The desktop inspector must establish a positioning and layout/paint containment boundary so positioned descendants cannot extend the document’s scrollable area below the footer.
