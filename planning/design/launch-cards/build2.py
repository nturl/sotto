import pathlib
F3=pathlib.Path('Fraunces_300Light.b64').read_text(); F4=pathlib.Path('Fraunces_400Regular.b64').read_text()

CSS = f"""
@font-face{{font-family:Fraunces;font-weight:300;src:url(data:font/ttf;base64,{F3}) format("truetype")}}
@font-face{{font-family:Fraunces;font-weight:400;src:url(data:font/ttf;base64,{F4}) format("truetype")}}
:root{{--canvas:#F4ECDF;--surface:#FBF6EC;--surface2:#EFE4D2;--ink:#221E1B;--ink2:#6E6459;--quiet:#8F857A;--hair:rgba(34,30,27,.12);--hair2:rgba(34,30,27,.20);--accent:#E4572E;--peach:#F2C8B4;--mark:#FFD8A8;--sheet:#ECE9E1}}
*{{box-sizing:border-box;margin:0}}
html,body{{background:var(--sheet);color:var(--ink);-webkit-font-smoothing:antialiased}}
body{{font-family:Inter,-apple-system,"Helvetica Neue",Arial,sans-serif}}
.sheet{{overflow-x:auto;padding:48px 24px}}
.stack{{width:1600px;margin:0 auto;display:grid;gap:48px}}
.note{{width:1600px;margin:0 auto 24px;font-family:"SF Mono",Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}}
.card{{position:relative;width:1600px;height:900px;background:var(--canvas);overflow:hidden;border:1px solid var(--hair);padding:80px 96px}}
.mono{{font-family:"SF Mono",Menlo,monospace;font-size:16px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}}
.eyebrow{{position:absolute;left:96px;top:80px}}
.site{{position:absolute;right:96px;top:80px}}
.foot{{position:absolute;left:96px;bottom:80px;display:flex;gap:18px;align-items:center}}
.foot i{{width:4px;height:4px;border-radius:9999px;background:var(--ink2);display:inline-block}}
.fr{{font-family:Fraunces,Georgia,serif;font-weight:300;letter-spacing:-.02em;line-height:1.0}}
h1{{font-family:Fraunces,Georgia,serif;font-weight:300;letter-spacing:-.02em;line-height:1.0;font-size:96px}}
.sel{{background:rgba(242,200,180,.55);border-radius:2px;padding:0 3px;margin:0 -3px}}
.q{{color:var(--quiet)}}

/* 1 · the page */
.c1 .passage{{position:absolute;left:96px;right:96px;top:150px;height:400px;overflow:hidden;columns:2;column-gap:72px;column-rule:1px solid var(--hair);font-family:Fraunces,Georgia,serif;font-weight:400;font-size:38px;line-height:1.5;color:var(--ink)}}
.c1 .passage p{{margin:0 0 .9em}}
.c1 .fade{{position:absolute;left:0;right:0;top:390px;bottom:0;background:linear-gradient(to bottom, rgba(244,236,223,0) 0%, #F4ECDF 38%)}}
.c1 h1{{position:absolute;left:96px;bottom:150px;font-size:104px;max-width:1000px}}
.c1 .gloss{{position:absolute;left:400px;top:444px;width:280px;background:var(--surface);border:1px solid var(--hair2);border-radius:10px;padding:14px 20px 16px;box-shadow:6px 6px 0 0 var(--peach)}}
.c1 .gloss b{{display:block;font-family:Fraunces,Georgia,serif;font-weight:400;font-size:34px;letter-spacing:-.01em;line-height:1}}
.c1 .gloss small{{display:block;font-size:20px;color:var(--ink2);margin-top:4px}}
.c1 .ring{{position:absolute;right:16px;top:14px;width:44px;height:44px;border:2px solid var(--accent);border-radius:9999px}}
.c1 .ring::after{{content:"";position:absolute;left:14px;top:12px;width:0;height:0;border-style:solid;border-width:9px 0 9px 12px;border-color:transparent transparent transparent var(--accent)}}

/* 2 · same story, your level */
.c2 h1{{margin-top:70px;font-size:96px;max-width:1100px}}
.c2 .scale{{display:inline-flex;margin-top:40px;border:1px solid var(--hair2);border-radius:10px;overflow:hidden}}
.c2 .scale span{{font-family:"SF Mono",Menlo,monospace;font-size:18px;letter-spacing:.06em;padding:12px 22px;border-right:1px solid var(--hair2);color:var(--ink2)}}
.c2 .scale span:last-child{{border-right:0}}
.c2 .scale span.on{{background:var(--ink);color:var(--surface)}}
.c2 .cols{{position:absolute;left:96px;right:96px;top:470px;display:grid;grid-template-columns:1fr 1fr;gap:72px}}
.c2 .col p{{font-family:Fraunces,Georgia,serif;font-size:33px;line-height:1.4;margin-top:22px;font-weight:300;color:var(--ink2)}}
.c2 .col.now p{{font-weight:400;color:var(--ink);font-size:36px}}
.c2 .cols::before{{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--hair)}}

/* 3 · tap any word, saved */
.c3 .word{{position:absolute;left:90px;top:190px;font-family:Fraunces,Georgia,serif;font-weight:300;font-size:300px;letter-spacing:-.03em;line-height:.9}}
.c3 .word i{{position:absolute;left:8px;right:-6px;bottom:6px;height:38px;background:var(--mark);transform:skew(-12deg,-.6deg);z-index:-1;border-radius:2px}}
.c3 .word{{z-index:0}}
.c3 .gloss{{position:absolute;left:96px;top:520px;font-size:44px;color:var(--ink2)}}
.c3 .line{{position:absolute;left:1030px;top:200px;width:474px;font-family:Fraunces,Georgia,serif;font-size:30px;line-height:1.5}}
.c3 .line .mono{{display:block;margin-bottom:18px}}
.c3 .line .m{{background:linear-gradient(transparent 62%, var(--mark) 62%, var(--mark) 92%, transparent 92%);padding:0 2px}}
.c3 .save{{position:absolute;left:1030px;top:470px;display:inline-flex;align-items:center;gap:12px;background:var(--mark);border:1.5px solid var(--ink);border-radius:10px;padding:16px 26px;font-size:24px;font-weight:500;box-shadow:4px 4px 0 0 var(--ink)}}
.c3 h1{{position:absolute;left:96px;bottom:150px;font-size:72px}}

/* 4 · say it out loud */
.c4 h1{{margin-top:70px;font-size:80px}}
.c4 .dlg{{position:absolute;left:96px;right:96px;top:380px;display:grid;grid-template-columns:120px 1fr;row-gap:44px;column-gap:24px;align-items:baseline}}
.c4 .who{{font-family:"SF Mono",Menlo,monospace;font-size:16px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}}
.c4 .t{{font-size:34px;line-height:1.35;color:var(--ink2)}}
.c4 .y{{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:58px;letter-spacing:-.015em;line-height:1.1}}
.c4 .dot{{display:inline-block;width:14px;height:14px;border-radius:9999px;background:var(--accent);margin-left:18px;vertical-align:middle}}

/* 5 · footnotes */
.c5 h1{{margin-top:70px;font-size:112px;max-width:1360px}}
.c5 h1 sup{{font-size:.36em;vertical-align:.9em;letter-spacing:.06em;color:var(--ink2);font-weight:400;margin-left:.06em}}
.c5 .rule{{position:absolute;left:96px;top:560px;width:220px;height:1px;background:var(--ink)}}
.c5 .fn{{position:absolute;left:96px;right:96px;top:596px;display:grid;grid-template-columns:1fr 1fr;column-gap:72px;row-gap:26px}}
.c5 .fn .n{{display:grid;grid-template-columns:34px 1fr;gap:8px;align-items:start;font-family:Fraunces,Georgia,serif;font-size:25px;line-height:1.4}}
.c5 .fn .n span{{font-family:"SF Mono",Menlo,monospace;font-size:16px;color:var(--ink2);padding-top:6px}}
.c5 .fn .n b{{font-weight:400}}
.c5 .fn .n>span+span{{font-family:inherit;font-size:inherit;color:inherit;padding:0}}
.c5 .fn .n em{{font-style:normal;color:var(--ink2)}}
"""

def shell(n, cls, eyebrow, body, foot):
    return f'''<section class="card {cls}" id="card-{n}" aria-label="Launch card {n}">
  <div class="mono eyebrow">{eyebrow}</div><div class="mono site">readsotto.app</div>
  {body}
  <div class="mono foot">{'<i></i>'.join(f'<span>{f}</span>' for f in foot)}</div>
</section>'''

# Real chapter-1 text from packages/content/packs/fr-FR/books/fr-chevre-de-m-seguin/chapters/01.json
c1 = shell(1,'c1','Sotto · a free graded reader', '''
  <div class="passage">
    <p>M. Seguin habitait dans une petite maison blanche, au bord d'un charmant village de Provence. M. Seguin n'avait jamais eu de chance avec ses <span class="sel">chèvres</span>. Il en avait perdu six, <span class="q">toutes mangées par le loup de la montagne.</span></p>
    <p class="q">Un jour, il a acheté une septième chèvre, toute jeune et très jolie. Il l'a appelée Blanquette, à cause de sa belle fourrure blanche. M. Seguin l'a attachée avec une longue corde près de sa petite maison. Il voulait la garder en sécurité, loin de la montagne dangereuse.</p>
    <p class="q">Mais Blanquette rêvait de liberté et regardait souvent la montagne. Elle trouvait sa corde trop courte et sa vie trop tranquille. Un matin, elle a refusé de manger son herbe habituelle. « Qu'est-ce qui ne va pas, ma petite chèvre ? » a demandé M. Seguin, inquiet. « Je veux aller courir sur la montagne », a répondu Blanquette.</p>
  </div>
  <div class="fade"></div>
  <div class="gloss"><b>chèvres</b><small>goats</small><i class="ring"></i></div>
  <h1>Read a page.<br>Then talk about it.</h1>''',
  ['Free','Open source','No account'])

c2 = shell(2,'c2','01 · Read', '''
  <h1>Same story.<br>Your level.</h1>
  <div class="scale"><span>A0</span><span>A1</span><span class="on">A2</span><span>B1</span><span>B2</span><span>C1</span></div>
  <div class="cols">
    <div class="col"><div class="mono">Alphonse Daudet · 1869 · the original</div>
      <p>M. Seguin n'avait jamais eu de bonheur avec ses chèvres. Il les perdait toutes de la même façon : un beau matin, elles cassaient leur corde, s'en allaient dans la montagne, et là-haut le loup les mangeait.</p></div>
    <div class="col now"><div class="mono">Sotto · rewritten at A2</div>
      <p>M. Seguin n'avait jamais eu de chance avec ses chèvres. Il en avait perdu six, toutes mangées par le loup de la montagne.</p></div>
  </div>''',
  ['La Chèvre de M. Seguin','Pick a language','Pick a level'])

c3 = shell(3,'c3','02 · Tap', '''
  <div class="word">chèvre<i></i></div>
  <div class="gloss">goat</div>
  <div class="line"><span class="mono">In this passage</span>Un jour, il a acheté une septième <span class="m">chèvre</span>, toute jeune et très jolie.</div>
  <div class="save">Saved</div>
  <h1>Tap any word. Save it,<br>and the mark stays on the page.</h1>''',
  ['Meaning','Sound','The sentence it lives in'])

c4 = shell(4,'c4','04 · Speak', '''
  <h1>Then say what you think,<br>out loud.</h1>
  <div class="dlg">
    <div class="who">Tutor</div><div class="t">Pourquoi M. Seguin attache-t-il Blanquette ?</div>
    <div class="who">You</div><div class="y">Parce qu'il a peur du loup.</div>
    <div class="who">Tutor</div><div class="t">Et Blanquette, qu'est-ce qu'elle veut ?</div>
    <div class="who">You</div><div class="y">Elle veut courir sur la <span class="q">montagne.</span><i class="dot"></i></div>
  </div>''',
  ['A voice tutor that read the same page'])

c5 = shell(5,'c5','05 · Power', '''
  <h1>Where the tutor runs is a footnote,<sup>1 2 3 4</sup> not a tier.</h1>
  <div class="rule"></div>
  <div class="fn">
    <div class="n"><span>1</span><span><b>On this device.</b> <em>On-device models. Nothing leaves the browser. Free.</em></span></div>
    <div class="n"><span>2</span><span><b>With your own key.</b> <em>Paste an OpenAI key; it stays on this device. Free.</em></span></div>
    <div class="n"><span>3</span><span><b>On your own machine.</b> <em>docker compose up, local models or your key. Free.</em></span></div>
    <div class="n"><span>4</span><span><b>Through Sotto.</b> <em>The hosted tutor, nothing to set up. $9.99 a month.</em></span></div>
  </div>''',
  ['Apache-2.0','Stories CC BY-SA','No analytics'])

html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sotto launch cards</title>
<style>{CSS}</style></head>
<body><div class="sheet">
<div class="note">Sotto launch cards v2 · 1600 × 900 · thread order · 2026-09-07</div>
<div class="stack">
{c1}
{c2}
{c3}
{c4}
{c5}
</div></div></body></html>'''
pathlib.Path('launch-cards.html').write_text(html)
print(len(html)//1024,'KB')
