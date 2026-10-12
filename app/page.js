import { readFile } from 'node:fs/promises';
import path from 'node:path';
import CalendarStudio from './studio';
import { structuredData } from './seo.mjs';

const BODY_PATTERN = /<body>([\s\S]*?)<script src=/;

/** Render the original studio interface without its legacy document or scripts. */
export default async function HomePage() {
  const template = await readFile(path.join(process.cwd(), 'app', 'calendar-template.html'), 'utf8');
  const markup = template.match(BODY_PATTERN)?.[1];
  if (!markup) throw new Error('Calendar studio template is missing its body.');
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, '\\u003c') }} /><CalendarStudio markup={markup} /></>;
}
