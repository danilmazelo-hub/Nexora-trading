"""NEXORA demo — local web server + market-data gateway (Python 3.8+, no dependencies).

Usage (from the project folder):
    python tools/serve.py            # http://localhost:8080
    python tools/serve.py 9000       # custom port

Market data (optional): every section has a primary API and backups with automatic failover
(see tools/providers.py). Keys go to tools/.env (see tools/.env.example) and never reach the browser.

Endpoints:
    GET  /api/live/status                          providers, chains, metrics (latency, availability)
    GET  /api/live/quotes?section=&ids=a,b         quotes with failover
    GET  /api/live/candles?section=&id=&tf=&limit= candles with failover
    GET  /api/live/book?id=&depth=                 crypto order book: Binance → OKX
    GET  /api/live/benchmark                       probe every provider now (speed / availability test)
    POST /api/live/config  {"section","chain":[...],"disabled":[...]}   change primary / backup order
"""
import http.server
import json
import os
import socketserver
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import providers  # noqa: E402

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env():
    path = os.path.join(ROOT, "tools", ".env")
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
HUB = providers.Hub(os.environ)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and "/api/" in str(args[0]):
            super().log_message(fmt, *args)

    def send_json(self, status, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if not u.path.startswith("/api/live/"):
            if os.path.basename(u.path) in (".env", "providers.json", ".twelvedata_usage.json"):
                return self.send_error(404)
            return super().do_GET()
        q = urllib.parse.parse_qs(u.query)
        one = lambda k, d="": (q.get(k) or [d])[0]
        route = u.path[len("/api/live/"):]
        try:
            if route == "status":
                return self.send_json(200, HUB.status())
            if route == "quotes":
                section = one("section")
                ids = [s for s in one("ids").split(",") if s][:80]
                if section not in providers.SECTIONS or not ids:
                    return self.send_json(400, {"code": "bad_request"})
                return self.send_json(200, HUB.quotes(section, ids, one("focus") or None))
            if route == "candles":
                section, sym, tf = one("section"), one("id"), one("tf", "1h")
                if section not in providers.SECTIONS or not sym or tf not in providers.TF_MS:
                    return self.send_json(400, {"code": "bad_request"})
                return self.send_json(200, HUB.candles(section, sym, tf, min(int(one("limit", "300") or 300), 500)))
            if route == "book":
                return self.send_json(200, HUB.book(one("id"), max(5, min(int(one("depth", "12") or 12), 20))))
            if route == "benchmark":
                return self.send_json(200, HUB.benchmark())
        except Exception as e:  # one provider error must never break the server
            return self.send_json(500, {"code": "server_error", "message": str(e)[:200]})
        return self.send_json(404, {"code": "not_found"})

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/api/live/config":
            return self.send_json(404, {"code": "not_found"})
        # Refuse config changes coming from other web origins (cross-site requests).
        origin = self.headers.get("Origin")
        if origin and urllib.parse.urlparse(origin).netloc not in ("localhost:%d" % PORT, "127.0.0.1:%d" % PORT):
            return self.send_json(403, {"code": "forbidden_origin"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(n) or b"{}")
            HUB.set_chain(data.get("section"), data.get("chain") or [], data.get("disabled"))
            return self.send_json(200, HUB.status())
        except Exception as e:
            return self.send_json(400, {"code": "bad_request", "message": str(e)[:200]})


Handler.extensions_map.update({".js": "text/javascript", ".webp": "image/webp", ".svg": "image/svg+xml"})

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"NEXORA demo: http://localhost:{PORT}/  (CRM: http://localhost:{PORT}/crm.html)  Ctrl+C to stop")
        for s in providers.SECTIONS:
            chain = [p + ("" if HUB.providers[p].available() else " (no key)") for p in HUB.chains[s]]
            print(f"  {s:12s} {' -> '.join(chain)}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
