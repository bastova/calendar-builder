import InfoPage, { infoMetadata } from '../info-page';
import ContactForm from './contact-form';

export const metadata = infoMetadata('Contact', 'Send a question, report a problem, or suggest an improvement to Calendar Builder.', 'contact');
export default function Page() {
  return <InfoPage title="Contact" intro="Have a question, found a problem, or have an idea? Send a message."><ContactForm /></InfoPage>;
}
