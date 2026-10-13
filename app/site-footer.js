const groups = [
  { title: 'Explore', links: [['/', 'Calendar builder'], ['/about/', 'About'], ['/faq/', 'FAQ']] },
  { title: 'Support', links: [['/contact/', 'Contact']] },
  { title: 'Privacy & usage', links: [['/privacy-policy/', 'Privacy Policy'], ['/terms/', 'Terms of Use']] }
];
export default function SiteFooter() {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return <footer className="site-footer" id="site-info" aria-labelledby="site-info-title">
    <div className="footer-main"><div className="footer-brand"><h2 id="site-info-title" tabIndex={-1}><a href={`${base}/`}>Calendar Builder</a></h2><p>Turn your photos into a calendar worth keeping.</p><p>Design your layout, explore the 3D preview, and download a PDF to print.</p></div>
    {groups.map(group => <nav key={group.title} aria-label={group.title}><h3>{group.title}</h3>{group.links.map(([href, label]) => <a key={label} href={href.startsWith('/') ? `${base}${href}` : href}>{label}</a>)}</nav>)}</div>
    <div className="footer-bottom"><p>© {new Date().getFullYear()} Calendar Builder.</p><p>Made for personal photo projects.</p><a href="#page-top">Back to top <span aria-hidden="true">↑</span></a></div>
  </footer>;
}
