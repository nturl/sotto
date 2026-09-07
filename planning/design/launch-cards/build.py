import pathlib
b = {n: pathlib.Path(f'{n}.b64').read_text() for n in ['home','reader','library']}
img = lambda n: f'data:image/png;base64,{b[n]}'

CSS = """
:root{--canvas:#F4ECDF;--surface:#FBF6EC;--surface2:#EFE4D2;--ink:#221E1B;--ink2:#6E6459;--hair:rgba(34,30,27,.12);--hair2:rgba(34,30,27,.20);--accent:#E4572E;--peach:#F2C8B4;--mark:#FFD8A8;--sheet:#ECE9E1}
*{box-sizing:border-box;margin:0}
html,body{background:var(--sheet);color:var(--ink);-webkit-font-smoothing:antialiased}
body{font-family:Inter,-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:14px}
.sheet{overflow-x:auto;padding:48px 24px}
.stack{width:1600px;margin:0 auto;display:grid;gap:48px}
.note{width:1600px;margin:0 auto 24px;font-family:"SF Mono",Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}
.card{position:relative;width:1600px;height:900px;background:var(--canvas);overflow:hidden;border:1px solid var(--hair)}
.txt{position:absolute;left:96px;top:96px;bottom:96px;width:800px;display:flex;flex-direction:column}
.eyebrow,.foot{font-family:"SF Mono",Menlo,monospace;font-size:16px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}
.foot{margin-top:auto;display:flex;gap:18px;align-items:center}
.foot i{width:4px;height:4px;border-radius:9999px;background:var(--ink2);display:inline-block}
h1{font-family:Fraunces,"Iowan Old Style",Georgia,serif;font-weight:300;font-size:88px;line-height:1.0;letter-spacing:-.02em;margin-top:150px;font-feature-settings:"ss01","ss03"}
.card-1 h1{margin-top:118px}
.cap{font-size:28px;line-height:1.5;color:var(--ink2);max-width:36rem;margin-top:36px}
.word{font-family:Fraunces,"Iowan Old Style",Georgia,serif;font-weight:300;font-size:36px;letter-spacing:-.01em;color:var(--ink);margin-bottom:22px}
/* the staged page: real screenshot, one peach cutout, hairline edge */
.page{position:absolute;left:984px;width:520px;overflow:hidden;background:var(--surface);border:1px solid var(--hair2);border-radius:2px;box-shadow:6px 6px 0 0 var(--peach)}
.page img{display:block;width:520px;height:auto}
.mask{position:absolute;left:0;right:0;top:100px;height:44px;background:#F4ECDF}
.page.bleed{top:120px;height:800px}
.page.clip{top:120px;height:676px}
.page.clip img{transform:translateY(-380px)}
/* typographic objects for cards 4 and 5 */
.obj{position:absolute;left:984px;top:120px;width:520px;background:var(--surface);border:1px solid var(--hair2);border-radius:2px;box-shadow:6px 6px 0 0 var(--peach);padding:36px 40px}
.state{display:flex;align-items:center;gap:12px;font-family:"SF Mono",Menlo,monospace;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);margin-bottom:28px}
.state i{width:8px;height:8px;border-radius:9999px;background:var(--accent);display:inline-block}
.passage{font-family:Fraunces,"Iowan Old Style",Georgia,serif;font-size:24px;line-height:1.55;padding-bottom:28px;border-bottom:1px solid var(--hair);margin-bottom:28px}
.passage mark{background:rgba(242,200,180,.55);color:inherit;border-radius:2px;padding:0 2px}
.turn{display:grid;grid-template-columns:72px 1fr;gap:12px;margin-bottom:22px;align-items:baseline}
.turn b{font-family:"SF Mono",Menlo,monospace;font-weight:400;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}
.turn p{font-size:20px;line-height:1.45}
.turn.you p{font-family:Fraunces,"Iowan Old Style",Georgia,serif;font-size:24px}
.rows{padding:10px 0}
.row{display:grid;grid-template-columns:1fr auto;gap:16px;padding:22px 28px 22px 32px;border-bottom:1px solid var(--hair);position:relative}
.row:last-child{border-bottom:0}
.row.on::before{content:"";position:absolute;left:0;top:22px;bottom:22px;width:3px;background:var(--accent)}
.row h3{font-family:Fraunces,"Iowan Old Style",Georgia,serif;font-weight:400;font-size:26px;letter-spacing:-.01em;line-height:1.15}
.row small{display:block;font-size:16px;color:var(--ink2);margin-top:6px;line-height:1.4}
.row span{font-family:"SF Mono",Menlo,monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);padding-top:8px;white-space:nowrap}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
"""

def card(n, eyebrow, h1, cap, foot, obj):
    foot_html = '<i></i>'.join(f'<span>{f}</span>' for f in foot)
    return f'''<section class="card card-{n}" id="card-{n}" aria-label="Launch card {n}">
  <div class="txt">
    <div class="eyebrow">{eyebrow}</div>
    <h1>{h1}</h1>
    <p class="cap">{cap}</p>
    <div class="foot">{foot_html}</div>
  </div>
  {obj}
</section>'''

cards = [
 card(1, 'readsotto.app · a free graded reader',
      'Read a page.<br>Then talk about it.',
      'A short book rewritten to your level. Tap any word, hear it read, then say what you think out loud to a tutor that read the same page.',
      ['Free','Open source','No account'],
      f'<figure class="page bleed"><img src="{img("home")}" alt="Sotto home: continue reading shelf and today\'s story"></figure>'),
 card(2, '01 · Read',
      'Pick a level.<br>The book is rewritten to fit.',
      'A0 to C1 on one scale. Cendrillon at A1, Mateo Falcone at B2. The same story, set at the level you can actually read.',
      ['Pick a language','Pick a level'],
      f'<figure class="page bleed"><img src="{img("library")}" alt="Sotto library: search, level scale, collections, Tales shelf"><div class="mask"></div></figure>'),
 card(3, '02 · Tap',
      'Tap any word.',
      'Its meaning, its sound, and the sentence it lives in. Save it and the mark stays on the page.',
      ['La Chèvre de M. Seguin','A2'],
      f'<figure class="page clip"><img src="{img("reader")}" alt="Sotto reader with chèvre tapped: goat, save, in this passage, talk about this passage"></figure>'),
 card(4, '04 · Speak',
      'Then say what you<br>think, out loud.',
      'A voice tutor that already read the page asks you about it, and listens.',
      ['Tutor','Listening'],
      '''<div class="obj">
    <div class="state"><i></i>Listening</div>
    <p class="passage">Sotto est un livre gratuit et <mark>adapté</mark>. Vous choisissez une langue et un niveau, puis vous lisez.</p>
    <div class="turn"><b>Tutor</b><p>Pourquoi le livre est-il « adapté » ?</p></div>
    <div class="turn you"><b>You</b><p>Parce qu'il est réécrit pour mon niveau.</p></div>
    <div class="turn"><b>Tutor</b><p>Exactement. Et pour qui est-il réécrit ?</p></div>
  </div>'''),
 card(5, '05 · Power',
      'Where the tutor runs is a footnote, not a tier.',
      'Reading, listening, tap-to-translate and saved words are free. Choose where the voice tutor runs.',
      ['Apache-2.0','Stories CC BY-SA','No analytics'],
      '''<div class="obj rows">
    <div class="row on"><div><h3>On this device</h3><small>On-device models. Nothing leaves the browser.</small></div><span>Free</span></div>
    <div class="row"><div><h3>With your own key</h3><small>Paste an OpenAI key. It stays on this device.</small></div><span>Free</span></div>
    <div class="row"><div><h3>On your own machine</h3><small>docker compose up. Local models or your key.</small></div><span>Free</span></div>
    <div class="row"><div><h3>Through Sotto</h3><small>The hosted tutor. Nothing to set up.</small></div><span>$9.99 / mo</span></div>
  </div>'''),
]

html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sotto launch cards</title>
<style>{CSS}</style></head>
<body><div class="sheet">
<div class="note">Sotto launch cards · 1600 × 900 · thread order · 2026-09-07</div>
<div class="stack">
{chr(10).join(cards)}
</div></div></body></html>'''
pathlib.Path('launch-cards.html').write_text(html)
print(len(html)//1024, 'KB')
