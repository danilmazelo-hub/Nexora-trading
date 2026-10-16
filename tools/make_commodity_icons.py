"""Generates one consistent SVG icon set for commodities & metals (assets/icons/cm_*.svg)
and updates js/data/icons.js. Style: dark navy disc, coloured ring, centred vector glyph.
Run: python tools/make_commodity_icons.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "icons")


def disc(ring, body, label=None, label_color="#eaf2ff"):
    lab = ('<text x="32" y="53" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="8.5" '
           'font-weight="800" fill="%s" letter-spacing=".3">%s</text>' % (label_color, label)) if label else ""
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            '<defs><radialGradient id="bg" cx="35%%" cy="30%%" r="75%%"><stop offset="0" stop-color="#1b3a57"/>'
            '<stop offset="1" stop-color="#0a1828"/></radialGradient></defs>'
            '<circle cx="32" cy="32" r="30.5" fill="url(#bg)" stroke="%s" stroke-width="2.5"/>%s%s</svg>') % (ring, body, lab)


def ingot(c1, c2, c3, sym, text_color):
    return disc(c2, (
        '<defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%s"/><stop offset=".5" stop-color="%s"/>'
        '<stop offset="1" stop-color="%s"/></linearGradient></defs>'
        '<path d="M19 22h26l7 19H12Z" fill="url(#m)" stroke="%s" stroke-width="1.2" stroke-linejoin="round"/>'
        '<path d="M19 22h26l-4 5H23Z" fill="#ffffff" fill-opacity=".55"/>'
        '<text x="32" y="38" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="10" font-weight="800" fill="%s">%s</text>'
    ) % (c1, c2, c3, c3, text_color, sym), None)


ICONS = {
    # metals
    "XAU/USD": ingot("#fff4c2", "#f2b632", "#9c6a0e", "Au", "#5a3a00"),
    "XAG/USD": ingot("#ffffff", "#c9d6e3", "#6c8195", "Ag", "#2c3e50"),
    "XPT/USD": ingot("#f6ffff", "#a7d4d6", "#487d85", "Pt", "#1f4448"),
    "XPD/USD": ingot("#f3f0ff", "#b9b2d8", "#6b6491", "Pd", "#322c58"),
    "HG": ingot("#ffd5ae", "#d58b54", "#7b4225", "Cu", "#3d1c08"),
    # energy
    "USOIL": disc("#4fa3ff", '<rect x="21" y="13" width="22" height="30" rx="4" fill="#2e4256" stroke="#9fb7cc" stroke-width="1.5"/>'
                  '<path d="M21 21h22M21 35h22" stroke="#9fb7cc" stroke-width="1.5"/><path d="M32 23c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8Z" fill="#f5b52e"/>', "WTI"),
    "BRENT": disc("#f5a524", '<rect x="21" y="13" width="22" height="30" rx="4" fill="#2e4256" stroke="#9fb7cc" stroke-width="1.5"/>'
                  '<path d="M21 21h22M21 35h22" stroke="#9fb7cc" stroke-width="1.5"/><path d="M32 23c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8Z" fill="#f5b52e"/>', "BRENT"),
    "NATGAS": disc("#3fa9ff", '<path d="M32 11c7 8 12 13 12 21a12 12 0 0 1-24 0c0-5 3-9 6-12 0 4 2 6 4 7-1-6 0-11 2-16Z" fill="#3fa9ff"/>'
                   '<path d="M32 26c3 4 5 6 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10Z" fill="#bfe6ff"/>'),
    "RB": disc("#ff7a59", '<rect x="18" y="14" width="18" height="30" rx="3" fill="#ff7a59"/><rect x="21" y="18" width="12" height="9" rx="1.5" fill="#0a1828"/>'
               '<path d="M36 22h4a3 3 0 0 1 3 3v12a2 2 0 0 0 4 0V22l-4-5" fill="none" stroke="#ffb199" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    "HO": disc("#ff9f43", '<path d="M26 12c5 7 9 11 9 17a9 9 0 0 1-18 0c0-6 4-10 9-17Z" fill="#ffb84d"/>'
               '<path d="M38 24c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z" fill="#ff7a29"/><path d="M18 46h28" stroke="#ff9f43" stroke-width="2.4" stroke-linecap="round"/>'),
    "EH": disc("#5fd17a", '<path d="M30 12c6 8 10 13 10 19a10 10 0 0 1-20 0c0-6 4-11 10-19Z" fill="#7fd6ff"/>'
               '<path d="M34 46c0-9 5-14 13-15-1 8-6 13-13 15Z" fill="#5fd17a"/><path d="M34 46c3-5 6-8 10-11" stroke="#2f8a49" stroke-width="1.4" fill="none"/>'),
    # agriculture
    "CC": disc("#c98b5a", '<ellipse cx="32" cy="30" rx="11" ry="17" fill="#a0603a" transform="rotate(25 32 30)"/>'
               '<path d="M24 18c6 6 10 14 13 24M30 15c4 7 6 15 7 25M22 25c5 4 9 10 11 18" stroke="#6b3a1e" stroke-width="1.5" fill="none" stroke-linecap="round"/>'),
    "KC": disc("#c07a4a", '<ellipse cx="32" cy="31" rx="12" ry="16" fill="#8b5130" transform="rotate(30 32 31)"/>'
               '<path d="M27 19c5 6 2 12 4 17s7 6 7 8" stroke="#3a1d0c" stroke-width="2.4" fill="none" stroke-linecap="round"/>'),
    "SB": disc("#e9eef5", '<path d="M18 30l10-5 10 5-10 5Z" fill="#ffffff"/><path d="M18 30v11l10 5V35Z" fill="#d7e1ec"/><path d="M38 30v11l-10 5V35Z" fill="#b8c7d8"/>'
               '<path d="M30 20l8-4 8 4-8 4Z" fill="#ffffff"/><path d="M30 20v9l8 4v-9Z" fill="#d7e1ec"/><path d="M46 20v9l-8 4v-9Z" fill="#b8c7d8"/>'),
    "CT": disc("#dfe8f2", '<circle cx="26" cy="27" r="7" fill="#ffffff"/><circle cx="38" cy="27" r="7" fill="#f4f8fc"/><circle cx="32" cy="20" r="7" fill="#ffffff"/>'
               '<circle cx="32" cy="32" r="7" fill="#eef4fa"/><path d="M24 36l8 8 8-8" fill="#6b8f4e"/><path d="M32 44v6" stroke="#6b8f4e" stroke-width="2.4" stroke-linecap="round"/>'),
    "OJ": disc("#ff9e2c", '<circle cx="32" cy="34" r="13" fill="#ff9e2c"/><circle cx="32" cy="34" r="13" fill="none" stroke="#ffc46b" stroke-width="1.5" stroke-dasharray="2 3"/>'
               '<path d="M32 21c0-4 3-7 8-8-1 5-4 8-8 8Z" fill="#5fd17a"/><path d="M32 21v-4" stroke="#6b4e2a" stroke-width="2" stroke-linecap="round"/>'),
    "LBS": disc("#c99a63", '<rect x="12" y="23" width="30" height="18" rx="3" fill="#a87443"/><ellipse cx="42" cy="32" rx="8" ry="9" fill="#e8c08a"/>'
                '<ellipse cx="42" cy="32" rx="5" ry="6" fill="none" stroke="#a87443" stroke-width="1.4"/><circle cx="42" cy="32" r="1.6" fill="#a87443"/>'
                '<path d="M16 28h20M16 36h20" stroke="#7d5330" stroke-width="1.3"/>'),
    "LE": disc("#c98b5a", '<path d="M20 22c-6 0-8-5-7-9 2 4 5 5 9 5M44 22c6 0 8-5 7-9-2 4-5 5-9 5" fill="none" stroke="#efe3cf" stroke-width="2.6" stroke-linecap="round"/>'
               '<path d="M21 20h22l-2 16c-1 7-5 10-9 10s-8-3-9-10Z" fill="#a0603a"/><ellipse cx="32" cy="40" rx="7" ry="5" fill="#e3b28a"/>'
               '<circle cx="29.5" cy="40" r="1.2" fill="#5a3218"/><circle cx="34.5" cy="40" r="1.2" fill="#5a3218"/><circle cx="26" cy="28" r="1.6" fill="#1a0e06"/><circle cx="38" cy="28" r="1.6" fill="#1a0e06"/>'),
    "ZS": disc("#9ccc5a", '<path d="M14 40c4-14 17-22 34-22-3 15-15 24-34 22Z" fill="#7aa83c"/>'
               '<circle cx="24" cy="35" r="4.2" fill="#e8d48a"/><circle cx="31.5" cy="30" r="4.2" fill="#e8d48a"/><circle cx="39" cy="25" r="4.2" fill="#e8d48a"/>'),
    "ZM": disc("#c9b36a", '<path d="M18 32h28l-3 12a4 4 0 0 1-4 3H25a4 4 0 0 1-4-3Z" fill="#6b5a3a"/><ellipse cx="32" cy="32" rx="14" ry="4" fill="#8a7550"/>'
               '<g fill="#e8d48a"><circle cx="27" cy="28" r="2.2"/><circle cx="32" cy="26" r="2.2"/><circle cx="37" cy="28" r="2.2"/><circle cx="30" cy="22" r="2.2"/><circle cx="35" cy="22" r="2.2"/></g>'),
    "ZL": disc("#e8c84a", '<path d="M27 12h10v6l4 5v20a4 4 0 0 1-4 4H27a4 4 0 0 1-4-4V23l4-5Z" fill="#e8c84a" fill-opacity=".85" stroke="#fff1a8" stroke-width="1.4" stroke-linejoin="round"/>'
               '<rect x="27" y="10" width="10" height="4" rx="1" fill="#7aa83c"/><path d="M32 28c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8Z" fill="#fff6cf"/>'),
    "ZC": disc("#f2c94c", '<ellipse cx="32" cy="30" rx="8" ry="15" fill="#f2c94c"/>'
               '<g stroke="#c9962a" stroke-width="1.1"><path d="M25 22h14M24.5 28h15M24.5 34h15M26 40h12"/><path d="M29 16v28M32 15v30M35 16v28"/></g>'
               '<path d="M24 34c-6 4-7 9-6 14 5-2 9-6 10-12M40 34c6 4 7 9 6 14-5-2-9-6-10-12" fill="#5fae4a"/>'),
    "ZW": disc("#e2b45a", '<path d="M32 50V18" stroke="#c99a3e" stroke-width="2.2" stroke-linecap="round"/>'
               '<g fill="#e8be5e"><ellipse cx="32" cy="15" rx="3" ry="5"/><ellipse cx="27" cy="22" rx="3" ry="5" transform="rotate(-30 27 22)"/><ellipse cx="37" cy="22" rx="3" ry="5" transform="rotate(30 37 22)"/>'
               '<ellipse cx="27" cy="30" rx="3" ry="5" transform="rotate(-30 27 30)"/><ellipse cx="37" cy="30" rx="3" ry="5" transform="rotate(30 37 30)"/>'
               '<ellipse cx="27" cy="38" rx="3" ry="5" transform="rotate(-30 27 38)"/><ellipse cx="37" cy="38" rx="3" ry="5" transform="rotate(30 37 38)"/></g>'),
    "ZR": disc("#e9eef5", '<path d="M14 32h36a18 14 0 0 1-36 0Z" fill="#3c6e9e"/><path d="M14 32h36" stroke="#a8c8e8" stroke-width="2" stroke-linecap="round"/>'
               '<g fill="#ffffff"><ellipse cx="24" cy="28" rx="3" ry="1.6"/><ellipse cx="31" cy="26" rx="3" ry="1.6" transform="rotate(20 31 26)"/><ellipse cx="38" cy="28" rx="3" ry="1.6" transform="rotate(-15 38 28)"/>'
               '<ellipse cx="28" cy="22" rx="3" ry="1.6" transform="rotate(-25 28 22)"/><ellipse cx="35" cy="21" rx="3" ry="1.6"/><ellipse cx="42" cy="24" rx="3" ry="1.6" transform="rotate(25 42 24)"/></g>'),
}


def main():
    paths = {}
    for sym, svg in ICONS.items():
        name = "cm_" + re.sub(r"[^a-z0-9]+", "_", sym.lower()).strip("_") + ".svg"
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(svg)
        paths[sym] = "assets/icons/" + name
    p = os.path.join(ROOT, "js", "data", "icons.js")
    s = open(p, encoding="utf-8").read()
    m = re.search(r"NX\.ICONS = (\{.*?\});", s, re.S)
    icons = json.loads(m.group(1))
    old = {k: icons.get(k) for k in paths}
    icons.update(paths)
    s = s.replace(m.group(0), "NX.ICONS = " + json.dumps(icons, indent=0, sort_keys=True) + ";")
    open(p, "w", encoding="utf-8").write(s)
    # remove the replaced raster files that are no longer referenced
    still = set(icons.values())
    for v in old.values():
        if v and v not in still and os.path.isfile(os.path.join(ROOT, v)):
            os.remove(os.path.join(ROOT, v))
    print("icons:", len(paths))


if __name__ == "__main__":
    main()
