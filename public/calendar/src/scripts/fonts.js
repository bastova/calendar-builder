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
let loading;
export function loadCalendarFonts(){
  return loading ??= (async()=>{
    const embedded=[];
    await Promise.all(Object.entries(FONT_CATALOG).flatMap(([family,font])=>Object.entries(font.files).map(async([style,file])=>{
      const response=await fetch(`/calendar/fonts/${family}/${file}`);
      if(!response.ok)throw new Error(`Unable to load ${font.label}. Reload to retry.`);
      const data=await response.arrayBuffer();
      const face=new FontFace(font.label,data,{weight:style.includes('bold')?'700':'400',style:style.includes('italic')?'italic':'normal'});
      await face.load();document.fonts.add(face);
      let binary='';const bytes=new Uint8Array(data);
      for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      embedded.push({family,style,file,data:btoa(binary)});
    })));
    const Constructor=window.jspdf?.jsPDF;
    if(Constructor) Constructor.API.events.push(['addFonts',function(){
      for(const font of embedded){this.addFileToVFS(font.file,font.data);this.addFont(font.file,font.family,font.style);}
    }]);
  })();
}
