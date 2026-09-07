#!/usr/bin/env python3
"""compose.py -- builds planning/design/covers-directions.html from
covers-data.json + sheet-template.html.

Usage: python3 compose.py
    (reads ./covers-data.json and ./sheet-template.html next to this script,
    writes ../covers-directions.html)

No third-party dependencies. All book/direction text is HTML-escaped; each
book's `svg` field is injected raw (it is trusted, hand-authored markup).
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "covers-data.json")
TEMPLATE_PATH = os.path.join(HERE, "sheet-template.html")
OUT_PATH = os.path.abspath(os.path.join(HERE, "..", "covers-directions.html"))

INK_HEX = {"ink": "#221E1B", "canvas": "#F4ECDF"}

# Text-zone geometry per direction, held fixed by COVERS-DIRECTIONS-SPEC.md,
# expressed as percentages of the 220x330 viewBox so they work at any tile
# width (120 desktop, 104 phone).
ZONES = {
    "A": {  # ground below y 232 of 330
        "top": 232 / 330 * 100, "left": 0, "width": 100, "height": (330 - 232) / 330 * 100,
        "pad": "6% 9% 8% 12%",
    },
    "B": {  # solid band y 250 to 330
        "top": 250 / 330 * 100, "left": 0, "width": 100, "height": (330 - 250) / 330 * 100,
        "pad": "6% 10% 8%",
    },
    "C": {  # paper label x 24..196, y 210..300 of 220x330
        "top": 210 / 330 * 100, "left": 24 / 220 * 100, "width": (196 - 24) / 220 * 100,
        "height": (300 - 210) / 330 * 100, "pad": "6% 8%",
    },
}


def esc(s):
    return html.escape(str(s), quote=True)


def direction_noun(name):
    """'The Pressed Emblem' -> 'pressed emblem' (used in reply-builder phrasing)."""
    n = name.strip()
    if n.lower().startswith("the "):
        n = n[4:]
    return n.lower()


def render_tile(book, direction_key, width):
    scale = width / 120.0
    height = round(width * 330 / 220)
    title_size = round(13 * scale, 1)
    title_lh = round(title_size * 1.2, 1)
    author_size = round(8 * scale, 1)
    stamp_size = round(9 * scale, 1)
    shadow_off = max(2, round(6 * scale))

    zone = ZONES[direction_key]
    ink_hex = INK_HEX.get(book["textInk"], INK_HEX["ink"])

    zone_html = (
        f'<div class="cv-zone" style="bottom:{(100 - zone["top"] - zone["height"]):.2f}%;left:{zone["left"]:.2f}%;'
        f'width:{zone["width"]:.2f}%;min-height:{zone["height"]:.2f}%;padding:{zone["pad"]};'
        f'background-color:{esc(book["zoneBg"])};color:{ink_hex}">'
        f'<p class="cv-title" style="font-size:{title_size}px;line-height:{title_lh}px">{esc(book["title"])}</p>'
        f'<p class="cv-author" style="font-size:{author_size}px">{esc(book["author"])}</p>'
        f'<span class="cv-stamp" style="font-size:{stamp_size}px">{esc(book["level"])}</span>'
        f'</div>'
    )

    return (
        f'<div class="cv-tile" style="width:{width}px">'
        f'<div class="cv-frame" style="width:{width}px;height:{height}px;'
        f'box-shadow:{shadow_off}px {shadow_off}px 0 0 var(--peach)">'
        f'{book["svg"]}'
        f'{zone_html}'
        f'</div>'
        f'<p class="cv-under-title">{esc(book["title"])}</p>'
        f'<p class="cv-under-author">{esc(book["shortAuthor"])}</p>'
        f'<p class="cv-under-meta">{esc(book["minutes"])} MIN</p>'
        f'</div>'
    )


def render_list(items):
    return "".join(f"<li>{esc(item)}</li>" for item in items)


def render_band(direction):
    key = direction["key"]
    tiles_120 = "".join(render_tile(b, key, 120) for b in direction["books"])
    tiles_104 = "".join(render_tile(b, key, 104) for b in direction["books"])
    dna = direction["dna"]

    return f'''
<section class="cover-band" data-dir="{esc(key)}">
  <div class="wrap">
    <div class="band-head">
      <span class="band-letter mono">Direction {esc(key)}</span>
      <h2 class="band-name">{esc(direction["name"])}</h2>
    </div>
    <p class="band-thesis">This direction says: {esc(direction["thesis"])}</p>

    <p class="hero-label mono">Shelf at 120, desktop tile width</p>
    <div class="shelf-scroll"><div class="shelf-row">{tiles_120}</div></div>

    <p class="hero-label mono">At phone size</p>
    <div class="shelf-scroll"><div class="shelf-row at-phone">{tiles_104}</div></div>
    <p class="fragment-caption">Direction fragment: eight of the forty books, drawn by the wave, not a finished comp.</p>

    <div class="block-group">
      <div class="block"><p class="eyebrow">Commits to</p><ul>{render_list(direction["commits"])}</ul></div>
      <div class="block"><p class="eyebrow">Trades away</p><ul>{render_list(direction["trades"])}</ul></div>
      <div class="block"><p class="eyebrow">Right when</p><p>{esc(direction["rightWhen"])}</p></div>
      <div class="block">
        <p class="eyebrow">Build DNA</p>
        <div class="dna-grid">
          <div class="row"><span class="tag">Anchor</span><span class="val">{esc(dna["anchor"])}</span></div>
          <div class="row"><span class="tag">Ground</span><span class="val">{esc(dna["ground"])}</span></div>
          <div class="row"><span class="tag">Device</span><span class="val">{esc(dna["device"])}</span></div>
          <div class="row"><span class="tag">Type</span><span class="val">{esc(dna["type"])}</span></div>
          <div class="row"><span class="tag">Cost</span><span class="val">{esc(dna["cost"])}</span></div>
        </div>
      </div>
      <div class="block"><p class="eyebrow">Taken all the way</p><p>{esc(direction["allTheWay"])}</p></div>
    </div>

    <div class="band-chips" data-band="{esc(key)}">
      <span class="chip-label mono">This direction</span>
      <div class="chip-row" role="group" aria-label="Direction {esc(key)} action">
        <button class="chip" type="button" data-action="steal" aria-pressed="false">Steal</button>
        <button class="chip" type="button" data-action="skip" aria-pressed="false">Skip</button>
        <button class="chip" type="button" data-action="deeper" aria-pressed="false">Go deeper</button>
      </div>
    </div>
  </div>
</section>'''


def main():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = f.read()

    directions = data["directions"]
    bands_html = "\n".join(render_band(d) for d in directions)

    order = [d["key"] for d in directions]
    noun = {d["key"]: direction_noun(d["name"]) for d in directions}
    steal_phrase = {d["key"]: f'take {d["key"]}\'s {direction_noun(d["name"])}' for d in directions}
    reply_data = json.dumps({"order": order, "noun": noun, "stealPhrase": steal_phrase})

    out = template.replace("<!--AXIS-->", esc(data["axis"]))
    out = out.replace("<!--BANDS-->", bands_html)
    out = out.replace(
        "/*REPLY_DATA_JSON*/{}/*END_REPLY_DATA_JSON*/",
        "/*REPLY_DATA_JSON*/" + reply_data + "/*END_REPLY_DATA_JSON*/",
    )

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(out)
    print("wrote", OUT_PATH)


if __name__ == "__main__":
    main()
