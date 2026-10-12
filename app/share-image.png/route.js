import { ImageResponse } from 'next/og';
export const dynamic = 'force-static';
export function GET() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: '#18191b', color: '#fff', padding: 64, alignItems: 'center', gap: 64, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ fontSize: 22, color: '#fb923c', marginBottom: 28 }}>CALENDAR LAYOUT STUDIO</div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 66, lineHeight: 1.05, fontWeight: 700 }}><span>Your photos.</span><span>Your calendar.</span></div>
        <div style={{ fontSize: 26, color: '#d4d4d4', marginTop: 28 }}>Custom layouts · 3D preview · PDF export</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', width: 320, height: 400, background: '#fff', borderRadius: 12, padding: 20, color: '#241005' }}>
        <div style={{ display: 'flex', height: 170, background: '#f97316', borderRadius: 6, alignItems: 'center', justifyContent: 'center', fontSize: 80 }}><svg width="100" height="100" viewBox="0 0 100 100"><rect x="10" y="18" width="80" height="72" rx="8" fill="none" stroke="#241005" strokeWidth="6"/><path d="M10 40h80M30 10v18m40-18v18" stroke="#241005" strokeWidth="6"/></svg></div>
        <div style={{ display: 'flex', marginTop: 20, fontSize: 26 }}>Make every month yours</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>{Array.from({length: 28}, (_, i) => <div key={i} style={{display:'flex',width:30,height:20,background:i===14?'#f97316':'#e5e5e5',borderRadius:3}} />)}</div>
      </div>
    </div>, { width: 1200, height: 630 }
  );
}
