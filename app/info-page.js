export function infoMetadata(title, description, path) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return { title: `${title} | Calendar Builder`, description, alternates: { canonical: `${base}/${path}/` }, openGraph: { title: `${title} | Calendar Builder`, description, url: `${base}/${path}/` } };
}
export default function InfoPage({ title, intro, children }) {
  return <div className="info-page"><header className="info-header"><a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`}>← Calendar Builder</a></header><main className="info-content"><h1>{title}</h1><p className="info-intro">{intro}</p>{children}</main></div>;
}
