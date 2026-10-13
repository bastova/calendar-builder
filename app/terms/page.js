import InfoPage, { infoMetadata } from '../info-page';
export const metadata = infoMetadata('Terms of Use', 'Guidance for using Calendar Builder and your exported calendars.', 'terms');
export default function Page() {
  return <InfoPage title="Terms of Use" intro="A few practical guidelines for using Calendar Builder.">
    <p>Last updated: October 12, 2026.</p>
    <section><h2>Your images and content</h2><p>Use photographs, artwork, and text that you own or have permission to reproduce. Creating a calendar does not give you rights to someone else’s work. You retain your rights to the content you bring to the editor.</p></section>
    <section><h2>Review before printing or sharing</h2><p>Check dates, holidays, spelling, photo resolution, and layout before downloading or printing. Holiday entries are a starting point; verify dates relevant to your location and plans.</p><p>Printer-fit estimates and screen previews are planning tools. Confirm printable areas, paper support, binding, duplex orientation, and color with your printer or print shop. Make a physical proof before a larger print run.</p></section>
    <section><h2>Keep a copy of your work</h2><p>Saved settings belong to your browser and site address. Keep your original images and downloaded PDFs. Clearing browser data or losing access to an original folder can make saved work unavailable.</p></section>
    <section><h2>Use the site responsibly</h2><p>Do not interfere with the site’s operation or use it to distribute content you are not entitled to share. External services, including GitHub support links, have their own policies.</p></section>
    <section><h2>Questions</h2><p>Read the <a href="../privacy-policy/">Privacy Policy</a> for data handling details or visit <a href="../contact/">Contact</a> to ask a question or report a problem.</p></section>
  </InfoPage>;
}
