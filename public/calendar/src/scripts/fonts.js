export const FONT_CATALOG = {
  "lato": {
    "label": "Lato",
    "files": {
      "normal": "Lato-Regular.ttf",
      "bold": "Lato-Bold.ttf",
      "italic": "Lato-Italic.ttf",
      "bolditalic": "Lato-BoldItalic.ttf"
    }
  },
  "ptsans": {
    "label": "PT Sans",
    "files": {
      "normal": "PT_Sans-Web-Regular.ttf",
      "bold": "PT_Sans-Web-Bold.ttf",
      "italic": "PT_Sans-Web-Italic.ttf",
      "bolditalic": "PT_Sans-Web-BoldItalic.ttf"
    }
  },
  "ptserif": {
    "label": "PT Serif",
    "files": {
      "normal": "PT_Serif-Web-Regular.ttf",
      "bold": "PT_Serif-Web-Bold.ttf",
      "italic": "PT_Serif-Web-Italic.ttf",
      "bolditalic": "PT_Serif-Web-BoldItalic.ttf"
    }
  },
  "crimsontext": {
    "label": "Crimson Text",
    "files": {
      "normal": "CrimsonText-Regular.ttf",
      "bold": "CrimsonText-Bold.ttf",
      "italic": "CrimsonText-Italic.ttf",
      "bolditalic": "CrimsonText-BoldItalic.ttf"
    }
  },
  "arvo": {
    "label": "Arvo",
    "files": {
      "normal": "Arvo-Regular.ttf",
      "bold": "Arvo-Bold.ttf",
      "italic": "Arvo-Italic.ttf",
      "bolditalic": "Arvo-BoldItalic.ttf"
    }
  },
  "spectral": {
    "label": "Spectral",
    "files": {
      "normal": "Spectral-Regular.ttf",
      "bold": "Spectral-Bold.ttf",
      "italic": "Spectral-Italic.ttf",
      "bolditalic": "Spectral-BoldItalic.ttf"
    }
  },
  "cousine": {
    "label": "Cousine",
    "files": {
      "normal": "Cousine-Regular.ttf",
      "bold": "Cousine-Bold.ttf",
      "italic": "Cousine-Italic.ttf",
      "bolditalic": "Cousine-BoldItalic.ttf"
    }
  },
  "abrilfatface": {
    "label": "Abril Fatface",
    "files": {
      "normal": "AbrilFatface-Regular.ttf"
    }
  },
  "bebasneue": {
    "label": "Bebas Neue",
    "files": {
      "normal": "BebasNeue-Regular.ttf"
    }
  },
  "anton": {
    "label": "Anton",
    "files": {
      "normal": "Anton-Regular.ttf"
    }
  },
  "abel": {
    "label": "Abel",
    "files": {
      "normal": "Abel-Regular.ttf"
    }
  }
};
export const FONT_LABELS={times:'Times · Times New Roman',helvetica:'Helvetica · Arial',courier:'Courier · Courier New',...Object.fromEntries(Object.entries(FONT_CATALOG).map(([key,font])=>[key,font.label]))};
export const CSS_FONT_FAMILIES = {times:'"Times New Roman", Times, serif',helvetica:'Arial, Helvetica, sans-serif',courier:'"Courier New", Courier, monospace',...Object.fromEntries(Object.entries(FONT_CATALOG).map(([key,font])=>[key,`"${font.label}"`]))};
const embedded = [];
const sourceFonts = new Map();

/** Return original font bytes for portable design sharing. Core system fonts have no distributable file. */
export function calendarFontSources() { return [...sourceFonts.values()]; }
const hookedConstructors = new WeakSet();
const BINARY_CHUNK_SIZE = 8192;
function encodedFont(data) {
  let binary='';const bytes=new Uint8Array(data);
  for(let i=0;i<bytes.length;i+=BINARY_CHUNK_SIZE)binary+=String.fromCharCode(...bytes.subarray(i,i+BINARY_CHUNK_SIZE));
  return btoa(binary);
}
function installPdfFonts() {
  const Constructor=window.jspdf?.jsPDF;
  if(Constructor && !hookedConstructors.has(Constructor)) {
    Constructor.API.events.push(['addFonts',function(){
      for(const font of embedded){this.addFileToVFS(font.file,font.data);this.addFont(font.file,font.family,font.style);}
    }]);
    hookedConstructors.add(Constructor);
  }
}
/** Load and verify an uploaded face before exposing its normal-only browser/PDF family. */
export async function registerCustomFont({family,label,data}) {
  if(!/^custom_[a-f0-9]{64}$/.test(family))throw new Error('Invalid custom font identifier.');
  if(FONT_CATALOG[family])return;
  const face=new FontFace(family,data,{weight:'400',style:'normal'});
  try {await face.load();if(face.status!=='loaded')throw new Error('Font did not load.');}
  catch {throw new Error('The browser could not load this TrueType font. Try another static .ttf file.');}
  const encoded=encodedFont(data);
  document.fonts.add(face);
  const file=`${family}.ttf`;
  embedded.push({family,style:'normal',file,data:encoded});
  sourceFonts.set(`${family}/normal`,{family,style:'normal',file,data:data.slice(0),custom:true});
  FONT_CATALOG[family]={label,files:{normal:file},custom:true};
  FONT_LABELS[family]=label;
  CSS_FONT_FAMILIES[family]=family;
  installPdfFonts();
}

/** Load a shared bundled face from the imported folder for both preview and PDF. */
export async function importBundledFont(family, style, data) {
  const font=FONT_CATALOG[family];
  if(!font || font.custom || !Object.hasOwn(font.files,style))throw new Error('Unknown bundled font face.');
  const face=new FontFace(font.label,data,{weight:style.includes('bold')?'700':'400',style:style.includes('italic')?'italic':'normal'});
  await face.load();
  document.fonts.add(face);
  const existing=embedded.find(item=>item.family===family&&item.style===style);
  if(!existing)throw new Error('Bundled font registry is unavailable.');
  existing.data=encodedFont(data);
  sourceFonts.set(`${family}/${style}`,{family,style,file:font.files[style],data,custom:false});
}

let loading;
/** Load bundled artwork fonts and install the live PDF font registry. */
export function loadCalendarFonts(){
  return loading ??= (async()=>{
    await Promise.all(Object.entries(FONT_CATALOG).filter(([,font])=>!font.custom).flatMap(([family,font])=>Object.entries(font.files).map(async([style,file])=>{
      const response=await fetch(new URL(`../../fonts/${family}/${file}`, import.meta.url));
      if(!response.ok)throw new Error(`Unable to load ${font.label}. Reload to retry.`);
      const data=await response.arrayBuffer();
      const face=new FontFace(font.label,data,{weight:style.includes('bold')?'700':'400',style:style.includes('italic')?'italic':'normal'});
      await face.load();document.fonts.add(face);
      embedded.push({family,style,file,data:encodedFont(data)});
      sourceFonts.set(`${family}/${style}`,{family,style,file,data,custom:false});
    })));
    installPdfFonts();
  })();
}
