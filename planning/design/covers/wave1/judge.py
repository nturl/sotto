"""Parse a worker's out-*.md into covers, validate against the brief, render a contact sheet."""
import re, sys, json, html, subprocess, os, xml.etree.ElementTree as ET
PAL={'#E8D6B8','#1F4F57','#6E9A7C','#8C3B2E','#F2C8B4','#2B2A28','#221E1B','#F4ECDF','#FFD8A8','#4E7D5B','#B8651B'}
FIX=['en-poe-tell-tale-heart','fr-maupassant-la-parure','es-quijote-molinos','en-oz-cyclone','fr-petit-chaperon-rouge','zh-chengyu-stories','pt-jabuti-onca','es-larra-vuelva-usted']
def parse(path):
    txt=open(path,encoding='utf-8').read()
    out={}
    for m in re.finditer(r'###\s*`?([a-z0-9\-]+)`?\s*\n(.*?)(?=\n###\s|\Z)',txt,re.S):
        bid,body=m.group(1),m.group(2)
        svg=re.search(r'```(?:svg|xml|html)?\s*\n(<svg.*?</svg>)\s*```',body,re.S)
        if not svg: svg=re.search(r'(<svg.*?</svg>)',body,re.S)
        ink=re.search(r'TEXT INK:\s*\**\s*(ink|canvas)',body,re.I)
        motif=re.search(r'MOTIF:\s*\**\s*(.+)',body); why=re.search(r'WHY:\s*\**\s*(.+)',body)
        out[bid]={'svg':svg.group(1).strip() if svg else None,'textInk':(ink.group(1).lower() if ink else None),'motif':motif.group(1).strip(' *') if motif else '','why':why.group(1).strip(' *') if why else ''}
    return out
def validate(bid,c):
    probs=[]
    s=c['svg']
    if not s: return ['NO SVG']
    try: root=ET.fromstring(s)
    except Exception as e: return [f'XML parse: {e}']
    if 'viewBox' not in root.attrib or root.attrib['viewBox'].split()!=['0','0','220','330']: probs.append('viewBox')
    cols=set(x.upper() for x in re.findall(r'#[0-9a-fA-F]{6}\b',s))
    bad=cols-PAL
    if bad: probs.append('off-palette '+','.join(sorted(bad)))
    if re.search(r'#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])',s): probs.append('3-digit hex')
    if re.search(r'\b(rgb|hsl)\(',s): probs.append('rgb/hsl')
    if len(cols)<3 or len(cols)>4: probs.append(f'tones={len(cols)}')
    for tag in ('text','linearGradient','radialGradient','filter','image'):
        if s.find('<'+tag)>=0: probs.append('has <'+tag+'>')
    n=sum(1 for _ in root.iter())-1
    if n>60: probs.append(f'elements={n}')
    for sw in re.findall(r'stroke-width="?([0-9.]+)',s):
        if float(sw)<2: probs.append(f'stroke {sw}')
    if not c['textInk']: probs.append('no TEXT INK')
    return probs
def sheet(sets,outpng,label):
    """sets: list of (name, {bid:cover}) -> contact sheet html -> png."""
    rows=[]
    for name,cov in sets:
        cells=[]
        for bid in FIX:
            c=cov.get(bid); 
            if not c or not c['svg']: cells.append(f'<div class="cell"><div class="cv miss">missing</div><div class="cap">{bid}</div></div>'); continue
            ink='#221E1B' if c['textInk']!='canvas' else '#F4ECDF'
            cells.append(f'<div class="cell"><div class="cv">{c["svg"]}</div><div class="cv s">{c["svg"]}</div><div class="cap">{html.escape(bid)}<br>{html.escape(c["motif"][:40])}</div></div>')
        rows.append(f'<h2>{html.escape(name)}</h2><div class="row">{"".join(cells)}</div>')
    doc=f'''<!doctype html><meta charset="utf-8"><style>body{{margin:0;padding:16px;background:#F1ECE3;font:12px Inter,system-ui,sans-serif;color:#221E1B;width:1180px}}h2{{font:300 18px Georgia,serif;margin:14px 0 6px}}.row{{display:flex;gap:14px;align-items:flex-start}}.cell{{width:130px}}.cv{{width:120px;height:180px;border-radius:4px;overflow:hidden;background:#ddd}}.cv.s{{width:104px;height:156px;margin-top:6px}}.cv svg{{width:100%;height:100%;display:block}}.miss{{display:flex;align-items:center;justify-content:center}}.cap{{margin-top:4px;font-size:10px;color:#6E6459;line-height:1.3}}</style><h1 style="font:300 22px Georgia,serif;margin:0 0 8px">{html.escape(label)}</h1>{"".join(rows)}'''
    h=outpng.replace('.png','.html'); open(h,'w').write(doc)
    subprocess.run(['shot-scraper','shot',h,'-o',outpng,'-w','1200','--quality','80'],check=False,capture_output=True)
    return outpng
if __name__=='__main__':
    d=os.path.dirname(os.path.abspath(__file__))
    sets=[]
    for f in sorted(sys.argv[1:]):
        cov=parse(f); name=os.path.basename(f).replace('out-','').replace('.md','')
        print(f'== {name}: {len(cov)} covers parsed')
        for bid in FIX:
            c=cov.get(bid)
            print('  ',bid, 'MISSING' if not c else (validate(bid,c) or 'ok'), '|', (c['motif'] if c else ''))
        json.dump(cov,open(os.path.join(d,f'parsed-{name}.json'),'w'))
        sets.append((name,cov))
    if sets:
        print(sheet(sets,os.path.join(d,'contact-'+'-'.join(n for n,_ in sets)+'.png'),'Wave 1 contact sheet'))
