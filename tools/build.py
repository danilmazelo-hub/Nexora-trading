"""NEXORA demo — build script (Python 3.8+, no dependencies).

Produces:
  dist/nexora-standalone.html      one self-contained file (CSS, JS and all icons inlined)
  dist/nexora-trading-source.zip   project sources + standalone file + docs

Usage (from the project folder):
    python tools/build.py
"""
import base64
import mimetypes
import os
import re
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
MIME = {".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg"}


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def data_uri(rel):
    ext = os.path.splitext(rel)[1].lower()
    mime = MIME.get(ext) or mimetypes.guess_type(rel)[0] or "application/octet-stream"
    with open(os.path.join(ROOT, rel), "rb") as f:
        return "data:%s;base64,%s" % (mime, base64.b64encode(f.read()).decode("ascii"))


def safe_js(code):
    # Inline scripts must not contain a closing script tag.
    return code.replace("</script", "<\\/script")


def build_standalone():
    html = read("index.html")
    # 1) stylesheet
    html = html.replace('<link rel="stylesheet" href="css/app.css">', "<style>\n" + read("css/app.css") + "\n</style>")
    # 2) assets map (icons, flags, logo) → window.NX_ASSETS
    assets = {}
    for base, _dirs, files in os.walk(os.path.join(ROOT, "assets")):
        for name in sorted(files):
            rel = os.path.relpath(os.path.join(base, name), ROOT).replace(os.sep, "/")
            assets[rel] = data_uri(rel)
    import json
    assets_js = "window.NX_ASSETS = " + json.dumps(assets, separators=(",", ":")) + ";"
    # 3) scripts, in the same order as index.html
    def inline(match):
        src = match.group(1)
        return "<script>\n/* " + src + " */\n" + safe_js(read(src)) + "\n</script>"
    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    html = html.replace('<script>window.NX_ENTRY', "<script>" + assets_js + "</script>\n<script>window.NX_ENTRY", 1)
    # 4) static <img>/<link> references to the logo
    logo = assets.get("assets/logo-n.png", "")
    html = html.replace('src="assets/logo-n.png"', 'src="' + logo + '"').replace('href="assets/logo-n.png"', 'href="' + logo + '"')
    html = html.replace("<title>NEXORA Trading — Demo</title>", "<title>NEXORA Trading — Standalone demo</title>")
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "nexora-standalone.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    return out


INCLUDE = ["index.html", "crm.html", "README.md", "THIRD-PARTY-NOTICES.txt", "css", "js", "assets", "docs", "tools"]


def build_zip(standalone):
    out = os.path.join(DIST, "nexora-trading-source.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for item in INCLUDE:
            path = os.path.join(ROOT, item)
            if os.path.isfile(path):
                z.write(path, "nexora-trading/" + item)
            elif os.path.isdir(path):
                for base, _dirs, files in os.walk(path):
                    if "__pycache__" in base:
                        continue
                    for name in sorted(files):
                        if name in (".env", "providers.json", ".twelvedata_usage.json"):  # local keys / runtime config never go into the archive
                            continue
                        full = os.path.join(base, name)
                        rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
                        z.write(full, "nexora-trading/" + rel)
        z.write(standalone, "nexora-trading/dist/nexora-standalone.html")
    return out


if __name__ == "__main__":
    s = build_standalone()
    print("standalone:", s, round(os.path.getsize(s) / 1024 / 1024, 2), "MB")
    zp = build_zip(s)
    print("zip:", zp, round(os.path.getsize(zp) / 1024 / 1024, 2), "MB")
