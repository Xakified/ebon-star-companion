"""Build a single-file demo of the app for publishing as a claude.ai Artifact.
Inlines the local scripts and drops the PWA bits (service workers don't run there).
Usage: python3 tools/make-artifact.py <out.html>"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text()
def inline(m):
    src = m.group(1)
    if src.startswith("http"): return m.group(0)
    return "<script>\n" + (root / src).read_text() + "\n</script>"
html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
html = re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?', "", html)
html = re.sub(r'<meta name="(apple-mobile-web-app[^"]*|mobile-web-app-capable|theme-color)"[^>]*>\n?', "", html)
html = re.sub(r'<!doctype html>\n?|</?html[^>]*>\n?|</?head>\n?|</?body>\n?|<meta charset[^>]*>\n?|<meta name="viewport"[^>]*>\n?', "", html, flags=re.I)
html = html.replace("Demo mode: data stays in this browser", "Demo: data stays in this browser")
pathlib.Path(sys.argv[1]).write_text(html)
print("wrote", sys.argv[1], len(html), "bytes")
