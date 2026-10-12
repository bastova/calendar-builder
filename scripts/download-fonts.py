import json, urllib.request, concurrent.futures
from pathlib import Path
families={'lato':'Lato','ptsans':'PT Sans','ptserif':'PT Serif','crimsontext':'Crimson Text','arvo':'Arvo','spectral':'Spectral','cousine':'Cousine','karla':'Karla','inconsolata':'Inconsolata','oswald':'Oswald','abrilfatface':'Abril Fatface','bebasneue':'Bebas Neue','anton':'Anton','abel':'Abel'}
root=Path('public/calendar/fonts');root.mkdir(parents=True,exist_ok=True)
def get(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'CalendarStudio'}),timeout=30).read()
def family(item):
 key,label=item
 listing=json.loads(get('https://api.github.com/repos/google/fonts/contents/ofl/'+key))
 files={f['name']:f for f in listing}
 static=[f for n,f in files.items() if n.endswith('.ttf') and '[' not in n]
 if not static:return None
 selected={}
 for style,suffix in [('normal','-Regular.ttf'),('bold','-Bold.ttf'),('italic','-Italic.ttf'),('bolditalic','-BoldItalic.ttf')]:
  matches=[f for f in static if f['name'].endswith(suffix)]
  if matches:
   f=matches[0]; dest=root/key;dest.mkdir(exist_ok=True);(dest/f['name']).write_bytes(get(f['download_url']));selected[style]=f['name']
 if not selected:return None
 license=files.get('OFL.txt') or files.get('LICENSE.txt');(root/key/license['name']).write_bytes(get(license['download_url']))
 return key,{'label':label,'files':selected}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: results=list(pool.map(family,families.items()))
manifest=dict(r for r in results if r)
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Downloaded',len(manifest),'families:',', '.join(manifest))
