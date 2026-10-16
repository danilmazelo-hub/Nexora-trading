"""NEXORA market-data providers: adapters, failover chains and metrics (Python 3.8+, stdlib only).

Each market section has an ordered chain of providers (primary first, then backups).
For every request the chain is walked: the primary serves what it can (respecting its limits),
symbols it could not serve go to the next provider, and so on. A provider that keeps failing is
"tripped" (circuit breaker) for a while and skipped. Every call is measured: latency,
success rate (availability), last error. Order and on/off state are editable at runtime and
saved to tools/providers.json.
"""
import calendar
import json
import os
import statistics
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "tools", "providers.json")
TD_USAGE_PATH = os.path.join(ROOT, "tools", ".twelvedata_usage.json")   # daily credit counter survives restarts
UA = {"User-Agent": "Mozilla/5.0 (NEXORA demo)", "Accept": "application/json"}

# ---------------------------------------------------------------- symbol maps
CG_IDS = {
    'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana', 'BNB/USD': 'binancecoin', 'XRP/USD': 'ripple', 'ADA/USD': 'cardano',
    'DOGE/USD': 'dogecoin', 'AVAX/USD': 'avalanche-2', 'DOT/USD': 'polkadot', 'LINK/USD': 'chainlink', 'TRX/USD': 'tron', 'LTC/USD': 'litecoin',
    'BCH/USD': 'bitcoin-cash', 'ETC/USD': 'ethereum-classic', 'XLM/USD': 'stellar', 'NEAR/USD': 'near', 'ICP/USD': 'internet-computer',
    'APT/USD': 'aptos', 'SUI/USD': 'sui', 'ATOM/USD': 'cosmos', 'ALGO/USD': 'algorand', 'HBAR/USD': 'hedera-hashgraph', 'VET/USD': 'vechain',
    'TIA/USD': 'celestia', 'SEI/USD': 'sei-network', 'TAO/USD': 'bittensor', 'HYPE/USD': 'hyperliquid', 'DASH/USD': 'dash', 'UNI/USD': 'uniswap',
    'AAVE/USD': 'aave', 'INJ/USD': 'injective-protocol', 'ONDO/USD': 'ondo-finance', 'ENA/USD': 'ethena', 'CRV/USD': 'curve-dao-token',
    'JUP/USD': 'jupiter-exchange-solana', 'PENDLE/USD': 'pendle', 'LDO/USD': 'lido-dao', 'ZRO/USD': 'layerzero', 'ARB/USD': 'arbitrum',
    'OP/USD': 'optimism', 'POL/USD': 'polygon-ecosystem-token', 'PEPE/USD': 'pepe', 'WIF/USD': 'dogwifcoin', 'TRUMP/USD': 'official-trump',
    'PUMP/USD': 'pump-fun', 'FET/USD': 'fetch-ai', 'RENDER/USD': 'render-token', 'FIL/USD': 'filecoin', 'WLD/USD': 'worldcoin-wld', 'ORDI/USD': 'ordinals'}
YF_INDEX = {'SPX': '^GSPC', 'NDX': '^NDX', 'DJI': '^DJI', 'IXIC': '^IXIC', 'RUT': '^RUT', 'VIX': '^VIX', 'FCHI': '^FCHI', 'GDAXI': '^GDAXI',
            'FTSE': '^FTSE', 'IBEX': '^IBEX', 'FTSEMIB': 'FTSEMIB.MI', 'AEX': '^AEX', 'N225': '^N225', 'HSI': '^HSI', 'SSEC': '000001.SS',
            'BSESN': '^BSESN', 'TWII': '^TWII', 'KS11': '^KS11'}
# Futures used as proxies for spot commodities; divisor converts cents → dollars.
YF_COMMOD = {'XAU/USD': ('GC=F', 1), 'XAG/USD': ('SI=F', 1), 'XPT/USD': ('PL=F', 1), 'XPD/USD': ('PA=F', 1), 'HG': ('HG=F', 1),
             'USOIL': ('CL=F', 1), 'BRENT': ('BZ=F', 1), 'NATGAS': ('NG=F', 1), 'RB': ('RB=F', 1), 'HO': ('HO=F', 1),
             'CC': ('CC=F', 1), 'KC': ('KC=F', 100), 'SB': ('SB=F', 100), 'CT': ('CT=F', 100), 'OJ': ('OJ=F', 100), 'LBS': ('LBR=F', 1),
             'LE': ('LE=F', 100), 'ZS': ('ZS=F', 100), 'ZM': ('ZM=F', 1), 'ZL': ('ZL=F', 100), 'ZC': ('ZC=F', 100), 'ZW': ('ZW=F', 100), 'ZR': ('ZR=F', 1)}
TF_MS = {'5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000}

SECTIONS = ['crypto', 'stocks', 'forex', 'metals', 'indices', 'commodities']
# Candles may need a different order than quotes: CoinGecko's free history is one price point per
# interval (not OHLC), so real exchange klines go first for crypto charts.
CANDLE_CHAINS = {'crypto': ['binance', 'okx', 'coingecko']}
DEFAULT_CHAINS = {
    'crypto': ['binance', 'coingecko', 'okx'],   # live price: Binance; CoinGecko (key) for periods & coins not on Binance
    'stocks': ['twelvedata', 'yahoo'],          # Twelve Data primary, Yahoo as backup (Alpaca once its key is added)
    'forex': ['twelvedata', 'yahoo', 'frankfurter'],
    'metals': ['twelvedata', 'yahoo'],          # free plan: only XAU/USD, other metals fall back
    'indices': ['yahoo'],
    'commodities': ['yahoo'],
}


def http_json(url, headers=None, timeout=10):
    req = urllib.request.Request(url, headers=dict(UA, **(headers or {})))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


class ProviderError(Exception):
    pass


# ---------------------------------------------------------------- metrics
class Metrics:
    def __init__(self):
        self.calls = self.ok = self.fail = 0
        self.lat = deque(maxlen=200)
        self.last_ok = self.last_fail = None
        self.last_error = None
        self.consecutive_fail = 0
        self.tripped_until = 0
        self.symbols_served = 0
        self.lock = threading.Lock()

    def record(self, ok, ms, err=None, served=0):
        with self.lock:
            self.calls += 1
            self.lat.append(ms)
            if ok:
                self.ok += 1; self.last_ok = time.time(); self.consecutive_fail = 0; self.symbols_served += served
            else:
                self.fail += 1; self.last_fail = time.time(); self.last_error = err; self.consecutive_fail += 1
                if self.consecutive_fail >= 3:           # circuit breaker: skip for 2 minutes
                    self.tripped_until = time.time() + 120

    def snapshot(self):
        with self.lock:
            lat = sorted(self.lat)
            p95 = lat[int(len(lat) * 0.95) - 1] if len(lat) >= 2 else (lat[0] if lat else None)
            return {"calls": self.calls, "ok": self.ok, "fail": self.fail,
                    "availability": round(self.ok / self.calls * 100, 1) if self.calls else None,
                    "avgMs": round(statistics.mean(lat)) if lat else None, "p95Ms": p95, "lastMs": self.lat[-1] if self.lat else None,
                    "lastOk": self.last_ok, "lastFail": self.last_fail, "lastError": self.last_error,
                    "tripped": time.time() < self.tripped_until, "trippedUntil": self.tripped_until if time.time() < self.tripped_until else None,
                    "symbolsServed": self.symbols_served}


# ---------------------------------------------------------------- providers
class Provider:
    name = ""; label = ""; sections = (); needs_key = False; official = True; note = ""

    def __init__(self):
        self.metrics = Metrics()
        self.cache = {}   # symbol -> (expires, quote)

    def available(self):
        return True

    def capacity(self, n):
        """How many symbols this provider may serve right now (rate-limit aware)."""
        return n

    def maps(self, section, sym):
        return True

    def quotes(self, section, syms):   # -> {sym: quote}
        raise NotImplementedError

    def candles(self, section, sym, tf, limit):
        raise NotImplementedError

    def info(self):
        return {"name": self.name, "label": self.label, "sections": list(self.sections), "needsKey": self.needs_key,
                "available": self.available(), "official": self.official, "note": self.note, "metrics": self.metrics.snapshot()}


def q(price, change_pct=None, high=None, low=None, vol_usd=None, t=None, open_=True):
    return {"price": float(price), "changePct": None if change_pct is None else float(change_pct), "high24": None if high is None else float(high),
            "low24": None if low is None else float(low), "volUsd24": None if vol_usd is None else float(vol_usd),
            "t": int(t or time.time() * 1000), "marketOpen": open_}


class CoinGecko(Provider):
    """One bulk request for all coins, at most once per `min_interval` seconds.
    The free Demo key allows ~10 000 calls/month, so a 5-minute refresh (~8 600/month) stays inside it."""
    name, label, sections = "coingecko", "CoinGecko", ("crypto",)

    def __init__(self, key="", min_interval=None):
        super().__init__(); self.key = key
        self.min_interval = int(min_interval or (300 if key else 60))
        self.bulk = (0, {})            # (expires, {cg_id: row})
        self.calls = deque(maxlen=20000)
        self.last_call_cached = False
        self.note = ("Demo API key: ~10 000 calls/month, refresh every %d s (~%d calls/month). Used for 7d/30d/1y changes and coins missing on Binance."
                     % (self.min_interval, 30 * 86400 // self.min_interval)) if key else "No key: public limits. Refresh every %d s." % self.min_interval

    def hdr(self):
        return {"x-cg-demo-api-key": self.key} if self.key else {}

    def maps(self, section, sym):
        return sym in CG_IDS

    def month_calls(self):
        now = time.time()
        return sum(1 for t in self.calls if now - t < 30 * 86400)

    def table(self):
        exp, rows = self.bulk
        if time.time() < exp and rows:
            self.last_call_cached = True
            return rows
        self.last_call_cached = False
        data = http_json("https://api.coingecko.com/api/v3/coins/markets?" + urllib.parse.urlencode(
            {"vs_currency": "usd", "ids": ",".join(CG_IDS.values()), "per_page": 250, "price_change_percentage": "24h,7d,30d,1y"}), self.hdr())
        self.calls.append(time.time())
        rows = {x["id"]: x for x in data}
        self.bulk = (time.time() + self.min_interval, rows)
        return rows

    def periods(self, sym):
        rows = self.bulk[1]
        x = rows.get(CG_IDS.get(sym, ""))
        if not x:
            return None
        return {"1d": x.get("price_change_percentage_24h_in_currency", x.get("price_change_percentage_24h")), "1w": x.get("price_change_percentage_7d_in_currency"),
                "1m": x.get("price_change_percentage_30d_in_currency"), "1y": x.get("price_change_percentage_1y_in_currency")}

    def quotes(self, section, syms):
        by = self.table()
        out = {}
        for s in syms:
            x = by.get(CG_IDS[s])
            if not x or not x.get("current_price"):
                continue
            pct = x.get("price_change_percentage_24h_in_currency", x.get("price_change_percentage_24h"))
            qq = q(x["current_price"], pct, x.get("high_24h"), x.get("low_24h"), x.get("total_volume"),
                   calendar.timegm(time.strptime(x["last_updated"][:19], "%Y-%m-%dT%H:%M:%S")) * 1000 if x.get("last_updated") else None)
            qq["periods"] = self.periods(s)
            out[s] = qq
        return out

    def candles(self, section, sym, tf, limit):
        days = 1 if tf in ("5m", "15m") else 30 if tf in ("1h", "4h") else 365
        r = http_json("https://api.coingecko.com/api/v3/coins/%s/market_chart?vs_currency=usd&days=%d" % (CG_IDS[sym], days), self.hdr())
        self.calls.append(time.time())
        return aggregate([(t, p) for t, p in r.get("prices", [])], tf, vols=r.get("total_volumes"))

    def info(self):
        d = super().info(); d["monthCalls"] = self.month_calls(); d["minInterval"] = self.min_interval; return d


class Binance(Provider):
    name, label, sections = "binance", "Binance", ("crypto",)
    note = "Public market data, no key. USDT pairs (≈ USD)."
    BULK_TTL = 20

    def __init__(self):
        super().__init__(); self.bulk = (0, {})

    def pair(self, sym):
        return sym.split("/")[0] + "USDT"

    def quotes(self, section, syms):
        exp, table = self.bulk
        if time.time() > exp:
            data = http_json("https://api.binance.com/api/v3/ticker/24hr?type=FULL", timeout=15)
            table = {x["symbol"]: x for x in data}
            self.bulk = (time.time() + self.BULK_TTL, table)
        out = {}
        for s in syms:
            x = table.get(self.pair(s))
            if x and float(x.get("lastPrice") or 0) > 0:
                out[s] = q(x["lastPrice"], x.get("priceChangePercent"), x.get("highPrice"), x.get("lowPrice"), x.get("quoteVolume"), x.get("closeTime"))
        return out

    def candles(self, section, sym, tf, limit):
        iv = {"5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w"}[tf]
        r = http_json("https://api.binance.com/api/v3/klines?" + urllib.parse.urlencode({"symbol": self.pair(sym), "interval": iv, "limit": min(limit, 1000)}))
        return [{"t": int(k[0]), "o": float(k[1]), "h": float(k[2]), "l": float(k[3]), "c": float(k[4]), "v": float(k[5])} for k in r]

    def book(self, sym, depth):
        r = http_json("https://api.binance.com/api/v3/depth?" + urllib.parse.urlencode({"symbol": self.pair(sym), "limit": 20 if depth <= 20 else 50}))
        return {"bids": [[float(p), float(v)] for p, v in r["bids"][:depth]], "asks": [[float(p), float(v)] for p, v in r["asks"][:depth]],
                "t": int(time.time() * 1000), "pair": self.pair(sym)}


class OKX(Provider):
    name, label, sections = "okx", "OKX", ("crypto",)
    note = "Public market data, no key. USDT pairs."

    def __init__(self):
        super().__init__(); self.bulk = (0, {})

    def quotes(self, section, syms):
        exp, table = self.bulk
        if time.time() > exp:
            r = http_json("https://www.okx.com/api/v5/market/tickers?instType=SPOT", timeout=15)
            if r.get("code") != "0":
                raise ProviderError(r.get("msg") or "okx error")
            table = {x["instId"]: x for x in r["data"]}
            self.bulk = (time.time() + 20, table)
        out = {}
        for s in syms:
            x = table.get(s.split("/")[0] + "-USDT")
            if x and float(x.get("last") or 0) > 0:
                last, op = float(x["last"]), float(x.get("open24h") or 0)
                out[s] = q(last, (last / op - 1) * 100 if op else None, x.get("high24h"), x.get("low24h"), x.get("volCcyQuote") or x.get("volCcy24h"), x.get("ts"))
        return out

    def candles(self, section, sym, tf, limit):
        bar = {"5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1Dutc", "1w": "1Wutc"}[tf]
        r = http_json("https://www.okx.com/api/v5/market/candles?" + urllib.parse.urlencode({"instId": sym.split("/")[0] + "-USDT", "bar": bar, "limit": min(limit, 300)}))
        if r.get("code") != "0":
            raise ProviderError(r.get("msg") or "okx error")
        return sorted(({"t": int(k[0]), "o": float(k[1]), "h": float(k[2]), "l": float(k[3]), "c": float(k[4]), "v": float(k[5])} for k in r["data"]), key=lambda c: c["t"])

    def book(self, sym, depth):
        inst = sym.split("/")[0] + "-USDT"
        r = http_json("https://www.okx.com/api/v5/market/books?" + urllib.parse.urlencode({"instId": inst, "sz": max(depth, 1)}))
        d = (r.get("data") or [{}])[0]
        if not d.get("bids"):
            raise ProviderError("no order book")
        return {"bids": [[float(x[0]), float(x[1])] for x in d["bids"][:depth]], "asks": [[float(x[0]), float(x[1])] for x in d["asks"][:depth]],
                "t": int(d.get("ts") or time.time() * 1000), "pair": inst}


class TwelveData(Provider):
    name, label, sections = "twelvedata", "Twelve Data", ("stocks", "forex", "metals")
    needs_key = True
    note = "Free plan: 8 credits/min, 800/day, 1 credit per symbol. Metals: only XAU/USD on free plan."
    METALS_FREE = ("XAU/USD",)

    def __init__(self, key, rpm=8, daily=800):
        super().__init__(); self.key = key; self.rpm = rpm; self.daily = daily; self.events = []; self.lock = threading.Lock()
        self.unsupported = set()
        self.day, self.day_used = self._today(), 0     # Twelve Data resets the daily limit at 00:00 UTC
        try:
            with open(TD_USAGE_PATH, encoding="utf-8") as f:
                u = json.load(f)
            if u.get("day") == self.day:
                self.day_used = int(u.get("used") or 0)
        except Exception:
            pass

    def available(self):
        return bool(self.key)

    @staticmethod
    def _today():
        return time.strftime("%Y-%m-%d", time.gmtime())

    def _save(self):
        try:
            with open(TD_USAGE_PATH, "w", encoding="utf-8") as f:
                json.dump({"day": self.day, "used": self.day_used}, f)
        except Exception:
            pass

    def _used(self):
        now = time.time(); self.events = [t for t in self.events if now - t < 60]
        if self.day != self._today():
            self.day, self.day_used = self._today(), 0
        return len(self.events), self.day_used

    def day_left(self):
        with self.lock:
            return max(0, self.daily - self._used()[1])

    @staticmethod
    def secs_to_reset():
        return 86400 - int(time.time()) % 86400

    def capacity(self, n):
        with self.lock:
            m, d = self._used()
            return max(0, min(n, self.rpm - m - 2, self.daily - d))   # keep 2 credits/min for charts and the speed test

    def _spend(self, n):
        with self.lock:
            m, d = self._used()
            if m + n > self.rpm or d + n > self.daily:
                raise ProviderError("rate_limited (Twelve Data credits)")
            self.events.extend([time.time()] * n); self.day_used += n; self._save()

    def _get(self, url):
        try:
            return http_json(url)
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", "replace")
            except Exception:
                pass
            if "for the day" in body:              # the key's daily credits are spent (possibly elsewhere)
                with self.lock:
                    self._used(); self.day_used = max(self.day_used, self.daily); self._save()
                raise ProviderError("daily_limit: Twelve Data credits for today are used up (reset 00:00 UTC)")
            raise

    def info(self):
        d = super().info()
        with self.lock:
            m, used = self._used()
        d["dayUsed"] = used; d["dayLimit"] = self.daily; d["minuteUsed"] = m
        return d

    def maps(self, section, sym):
        if sym in self.unsupported:
            return False
        return section != "metals" or sym in self.METALS_FREE

    def quotes(self, section, syms):
        self._spend(len(syms))
        r = self._get("https://api.twelvedata.com/quote?" + urllib.parse.urlencode({"symbol": ",".join(syms), "apikey": self.key, "timezone": "UTC"}))
        if r.get("status") == "error" and len(syms) == 1:
            if r.get("code") in (400, 404):
                self.unsupported.add(syms[0])
            raise ProviderError(r.get("message", "error")[:120])
        m = {syms[0]: r} if len(syms) == 1 else r
        out = {}
        for s in syms:
            x = m.get(s) or {}
            if x.get("status") == "error" or not x.get("close"):
                if "not available" in str(x.get("message", "")):
                    self.unsupported.add(s)
                continue
            price = float(x["close"])
            ts = int(x.get("last_quote_at") or x.get("timestamp") or 0) * 1000
            out[s] = q(price, x.get("percent_change"), x.get("high"), x.get("low"), float(x.get("volume") or 0) * price, ts or None, x.get("is_market_open") is not False)
        return out

    def candles(self, section, sym, tf, limit):
        self._spend(1)
        iv = {"5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day", "1w": "1week"}[tf]
        r = self._get("https://api.twelvedata.com/time_series?" + urllib.parse.urlencode({"symbol": sym, "interval": iv, "outputsize": min(limit, 500), "apikey": self.key, "timezone": "UTC"}))
        if r.get("status") == "error":
            raise ProviderError(r.get("message", "error")[:120])
        out = []
        for v in r.get("values", []):
            dt = v["datetime"] + ("T00:00:00" if len(v["datetime"]) <= 10 else "")
            t = calendar.timegm(time.strptime(dt.replace(" ", "T")[:19], "%Y-%m-%dT%H:%M:%S")) * 1000
            out.append({"t": bucket(t, tf), "o": float(v["open"]), "h": float(v["high"]), "l": float(v["low"]), "c": float(v["close"]), "v": float(v.get("volume") or 0)})
        return sorted(out, key=lambda c: c["t"])


class Yahoo(Provider):
    name, label, sections = "yahoo", "Yahoo Finance", ("stocks", "forex", "metals", "indices", "commodities")
    official = False
    note = "Unofficial endpoints, no key — for testing only (not licensed for commercial display). Commodities = front-month futures."

    def ysym(self, section, sym):
        if section == "stocks":
            return sym.replace(".", "-")
        if section == "forex":
            return sym.replace("/", "") + "=X"
        if section == "indices":
            return YF_INDEX.get(sym)
        return (YF_COMMOD.get(sym) or (None,))[0]

    def div(self, section, sym):
        return YF_COMMOD[sym][1] if section in ("metals", "commodities") and sym in YF_COMMOD else 1

    def maps(self, section, sym):
        return bool(self.ysym(section, sym))

    def quotes(self, section, syms):
        out = {}
        for i in range(0, len(syms), 15):
            part = syms[i:i + 15]
            ymap = {self.ysym(section, s): s for s in part}
            r = http_json("https://query1.finance.yahoo.com/v8/finance/spark?" + urllib.parse.urlencode({"symbols": ",".join(ymap), "range": "1d", "interval": "5m"}))
            if "spark" in r and isinstance(r["spark"], dict) and r["spark"].get("error"):
                raise ProviderError(str(r["spark"]["error"])[:120])
            for ys, s in ymap.items():
                x = r.get(ys)
                if not x:
                    continue
                closes = [c for c in (x.get("close") or []) if c is not None]
                if not closes:
                    continue
                d = self.div(section, s)
                price, prev = closes[-1] / d, (x.get("previousClose") or x.get("chartPreviousClose") or closes[0]) / d
                ts = (x.get("timestamp") or [0])[-1] * 1000
                is_open = time.time() * 1000 - ts < 30 * 60000
                out[s] = q(price, (price / prev - 1) * 100 if prev else None, max(closes) / d, min(closes) / d, None, ts or None, is_open)
        return out

    def candles(self, section, sym, tf, limit):
        if tf == "1w":
            # Yahoo's weekly futures bars occasionally carry broken ranges; weeks are built from cleaned daily bars.
            return regroup(clean(self.candles(section, sym, "1d", limit), "1d"), "1w")
        iv, rng = {"5m": ("5m", "5d"), "15m": ("15m", "1mo"), "1h": ("60m", "3mo"), "4h": ("60m", "6mo"), "1d": ("1d", "5y")}[tf]
        ys = self.ysym(section, sym)
        r = http_json("https://query1.finance.yahoo.com/v8/finance/chart/%s?%s" % (urllib.parse.quote(ys), urllib.parse.urlencode({"interval": iv, "range": rng})))
        res = (r.get("chart") or {}).get("result")
        if not res:
            raise ProviderError(str((r.get("chart") or {}).get("error"))[:120])
        res = res[0]; qd = res["indicators"]["quote"][0]; d = self.div(section, sym)
        rows = []
        for i, t in enumerate(res.get("timestamp") or []):
            o, h, l, c = qd["open"][i], qd["high"][i], qd["low"][i], qd["close"][i]
            if None in (o, h, l, c):
                continue
            rows.append({"t": t * 1000, "o": o / d, "h": h / d, "l": l / d, "c": c / d, "v": float(qd["volume"][i] or 0)})
        if tf == "4h":
            rows = regroup(rows, "4h")
        else:
            for x in rows:
                x["t"] = bucket(x["t"], tf)
        return rows


class Frankfurter(Provider):
    name, label, sections = "frankfurter", "Frankfurter (ECB)", ("forex",)
    note = "Official ECB reference rates, once per business day. Quotes only, no intraday history."

    def __init__(self):
        super().__init__(); self.table = (0, None)

    def quotes(self, section, syms):
        exp, data = self.table
        if time.time() > exp:
            data = {"now": http_json("https://api.frankfurter.dev/v1/latest?base=USD")}
            try:
                prev_day = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 4 * 86400))
                hist = http_json("https://api.frankfurter.dev/v1/%s..?base=USD" % prev_day)
                days = sorted(hist.get("rates", {}))
                data["prev"] = hist["rates"][days[-2]] if len(days) >= 2 else None
            except Exception:
                data["prev"] = None
            self.table = (time.time() + 1800, data)
        rates = dict(data["now"]["rates"], USD=1.0)
        prev = dict(data["prev"], USD=1.0) if data.get("prev") else None
        out = {}
        for s in syms:
            b, qc = s.split("/")
            if b in rates and qc in rates:
                price = rates[qc] / rates[b]
                pct = ((price / (prev[qc] / prev[b])) - 1) * 100 if prev and b in prev and qc in prev else None
                out[s] = q(price, pct, None, None, None, None, True)
        return out

    def candles(self, section, sym, tf, limit):
        raise ProviderError("no intraday history")


# ---------------------------------------------------------------- helpers
def bucket(t, tf):
    if tf == "1w":
        d = t // 86400000
        return ((d + 3) // 7 * 7 - 3) * 86400000
    return t // TF_MS[tf] * TF_MS[tf]


def fix_bar(o, h, l, c, v, prev_close):
    """Repairs one bar. Close is trusted; high/low are trusted when consistent; an open outside
    [low, high] is a feed error (e.g. Yahoo's first bar after a roll) and is clamped, never used to
    stretch the range. Close-only bars (o=h=l=c: the feed has no intraday range for that period)
    become prev-close→close candles instead of dashes."""
    if not (h >= l > 0):
        h, l = max(o, c), min(o, c)
    if c > h:
        h = c
    if c < l:
        l = c
    o = min(max(o, l), h)
    if prev_close and o == h == l == c and prev_close != c:
        o = prev_close
        h, l = max(o, c), min(o, c)
    return o, h, l, c


def clean(rows, tf):
    """Normalises candles from any provider: aligned buckets, sorted, one candle per bucket
    (duplicates merged — e.g. Yahoo's extra "live" bar), OHLC made consistent, bad rows dropped."""
    out = []
    for x in sorted((r for r in rows if r and r.get("c", 0) > 0), key=lambda r: r["t"]):
        b = bucket(int(x["t"]), tf)
        v = float(x.get("v") or 0)
        o = x.get("o") if x.get("o", 0) > 0 else x["c"]
        if out and out[-1]["t"] == b:
            cur = out[-1]
            o2, h, l, c = fix_bar(cur["o"], max(cur["h"], x.get("h") or 0), min(cur["l"], x.get("l") or cur["l"]), x["c"], cur["v"] + v, None)
            cur.update(o=o2, h=h, l=l, c=c, v=cur["v"] + v)
        else:
            o, h, l, c = fix_bar(float(o), float(x.get("h") or 0), float(x.get("l") or 0), float(x["c"]), v, out[-1]["c"] if out else None)
            out.append({"t": b, "o": o, "h": h, "l": l, "c": c, "v": v})
    return out


def regroup(rows, tf):
    out = []
    for x in rows:
        b = bucket(x["t"], tf)
        if out and out[-1]["t"] == b:
            c = out[-1]; c["h"] = max(c["h"], x["h"]); c["l"] = min(c["l"], x["l"]); c["c"] = x["c"]; c["v"] += x["v"]
        else:
            out.append(dict(x, t=b))
    return out


def aggregate(points, tf, vols=None):
    out = []; vol_at = {int(t): v for t, v in (vols or [])}
    for t, p in points:
        b = bucket(int(t), tf)
        if out and out[-1]["t"] == b:
            c = out[-1]; c["h"] = max(c["h"], p); c["l"] = min(c["l"], p); c["c"] = p; c["_n"] += 1; c["_v"] += vol_at.get(int(t), 0)
        else:
            out.append({"t": b, "o": p, "h": p, "l": p, "c": p, "_n": 1, "_v": vol_at.get(int(t), 0)})
    for c in out:   # rolling 24h USD volume → rough per-candle base volume
        c["v"] = (c.pop("_v") / c.pop("_n")) * min(TF_MS[tf], 86400000) / 86400000 / c["c"] if c["c"] else 0
    return out


# ---------------------------------------------------------------- hub
class Hub:
    QUOTE_TTL = 45
    # Forex on Twelve Data (free: 8 credits/min, 800/day). The open pair gets the daily budget,
    # spread evenly until the 00:00 UTC reset (about every 2 minutes, never faster than 15 s);
    # every other pair is refreshed from Twelve Data in rotation once per 3 hours and otherwise
    # comes from the cache / backup provider.
    FX_FOCUS_MIN = 15
    FX_OTHER_TTL = 3 * 3600
    FX_OTHER_RESERVE = 80     # credits/day kept for the rotation of other pairs and charts
    CANDLE_TTL = {"5m": 60, "15m": 120, "1h": 300, "4h": 600, "1d": 1800, "1w": 3600}

    def __init__(self, env):
        self.providers = {p.name: p for p in [
            CoinGecko(env.get("COINGECKO_API_KEY", ""), env.get("COINGECKO_MIN_INTERVAL")), Binance(), OKX(),
            TwelveData(env.get("TWELVEDATA_API_KEY", ""), int(env.get("TWELVEDATA_RPM", "8")), int(env.get("TWELVEDATA_DAILY", "800"))),
            Yahoo(), Frankfurter()]}
        self.chains = dict(DEFAULT_CHAINS)
        self.disabled = set()
        self.section_stats = {s: {"requests": 0, "served": 0, "fallback": 0, "unserved": 0, "lastProvider": None, "servedAt": {}} for s in SECTIONS}
        self.qcache = {}   # (section, sym) -> (expires, quote)
        self.td_last = {}  # (section, sym) -> last Twelve Data refresh time (rotation order)
        self.ccache = {}   # (section, sym, tf) -> (expires, payload)
        self.lock = threading.Lock()
        self.load_config()

    # config -------------------------------------------------------
    def load_config(self):
        if os.path.isfile(CONFIG_PATH):
            try:
                cfg = json.load(open(CONFIG_PATH, encoding="utf-8"))
                for s, chain in (cfg.get("chains") or {}).items():
                    if s in SECTIONS:
                        self.chains[s] = [p for p in chain if p in self.providers and s in self.providers[p].sections]
                self.disabled = set(cfg.get("disabled") or [])
            except Exception:
                pass

    def save_config(self):
        json.dump({"chains": self.chains, "disabled": sorted(self.disabled)}, open(CONFIG_PATH, "w", encoding="utf-8"), indent=2)

    def set_chain(self, section, chain, disabled=None):
        if section not in SECTIONS:
            raise ValueError("bad section")
        clean = [p for p in chain if p in self.providers and section in self.providers[p].sections]
        # keep providers that were not mentioned at the end (never lose a backup by accident)
        clean += [p for p in DEFAULT_CHAINS[section] if p not in clean]
        self.chains[section] = clean
        if disabled is not None:
            self.disabled = set(d for d in disabled if d in self.providers)
        # New primary / switched-off provider must take effect on the next request, not after the cache expires.
        self.qcache.clear()
        self.ccache.clear()
        self.save_config()

    def fx_focus_ttl(self):
        td = self.providers["twelvedata"]
        left = td.day_left() - self.FX_OTHER_RESERVE
        return max(self.FX_FOCUS_MIN, int(td.secs_to_reset() / max(1, left)))

    def usable(self, name):
        p = self.providers[name]
        return p.available() and name not in self.disabled and not p.metrics.snapshot()["tripped"]

    # quotes -------------------------------------------------------
    def quotes(self, section, syms, focus=None):
        st = self.section_stats[section]; st["requests"] += 1
        now = time.time(); out = {}; remaining = []
        for s in syms:
            hit = self.qcache.get((section, s))
            if hit and hit[0] > now:
                out[s] = hit[1]
            else:
                remaining.append(s)
        if section == "forex":
            # open pair first, then the pairs Twelve Data refreshed longest ago
            remaining.sort(key=lambda s: (s != focus, self.td_last.get((section, s), 0)))
        attempts = []
        chain = self.chains.get(section, [])
        for rank, name in enumerate(chain):
            if not remaining:
                break
            if not self.usable(name):
                attempts.append({"provider": name, "skipped": "disabled" if name in self.disabled else "no_key" if not self.providers[name].available() else "tripped"})
                continue
            p = self.providers[name]
            mine = [s for s in remaining if p.maps(section, s)]
            if section == "forex" and name == "twelvedata":
                # spend credits only on the open pair and on pairs due for their rotation refresh
                mine = [s for s in mine if s == focus or now - self.td_last.get((section, s), 0) >= self.FX_OTHER_TTL]
            n = p.capacity(len(mine))
            batch = mine[:n]
            if not batch:
                if mine:
                    attempts.append({"provider": name, "skipped": "rate_limit_budget"})
                continue
            t0 = time.time()
            try:
                res = p.quotes(section, batch)
                ms = int((time.time() - t0) * 1000)
                if not getattr(p, "last_call_cached", False):
                    p.metrics.record(True, ms, served=len(res))
                attempts.append({"provider": name, "ok": True, "ms": ms, "served": len(res), "asked": len(batch)})
            except Exception as e:
                ms = int((time.time() - t0) * 1000)
                p.metrics.record(False, ms, err=str(e)[:160])
                attempts.append({"provider": name, "ok": False, "ms": ms, "error": str(e)[:160]})
                continue
            for s, qq in res.items():
                qq["src"] = name; qq["srcLabel"] = p.label; qq["fallback"] = rank > 0; qq["official"] = p.official
                out[s] = qq
                ttl = self.QUOTE_TTL
                if section == "forex" and name == "twelvedata":
                    ttl = self.fx_focus_ttl() if s == focus else self.FX_OTHER_TTL
                    self.td_last[(section, s)] = time.time()
                    qq["refreshEvery"] = ttl
                self.qcache[(section, s)] = (time.time() + ttl, qq)
                if rank > 0:
                    st["fallback"] += 1
                    if section == "forex":   # short cache: Twelve Data takes these pairs over as credits allow
                        self.qcache[(section, s)] = (time.time() + 60, qq)
            if res:
                # every provider that actually served prices is "serving" (not only the last one in the chain)
                st["servedAt"][name] = time.time()
            st["lastProvider"] = name
            remaining = [s for s in remaining if s not in res]
        if section == "crypto" and "coingecko" in self.providers and self.usable("coingecko"):
            cg = self.providers["coingecko"]
            try:
                t0 = time.time(); cg.table(); ms = int((time.time() - t0) * 1000)
                if not cg.last_call_cached:
                    cg.metrics.record(True, ms, served=len(out)); attempts.append({"provider": "coingecko", "ok": True, "ms": ms, "enrich": True})
            except Exception as e:
                cg.metrics.record(False, int((time.time() - t0) * 1000), err=str(e)[:160])
            for s, qq in out.items():
                if not qq.get("periods"):
                    per = cg.periods(s)
                    if per:
                        qq["periods"] = dict(per, **{"1d": qq.get("changePct")})
        st["served"] += len(syms) - len(remaining); st["unserved"] += len(remaining)
        return {"section": section, "quotes": out, "unresolved": remaining, "attempts": attempts}

    # candles ------------------------------------------------------
    def candles(self, section, sym, tf, limit):
        key = (section, sym, tf)
        hit = self.ccache.get(key)
        if hit and hit[0] > time.time():
            return hit[1]
        attempts = []
        chain = [n for n in CANDLE_CHAINS.get(section, self.chains.get(section, [])) if n in self.providers]
        # A provider with too short a history (e.g. a coin listed recently on that exchange) is not
        # final: the next provider is tried and the longest series wins.
        enough = min(limit, 120)
        best = None
        for rank, name in enumerate(chain):
            if not self.usable(name):
                continue
            p = self.providers[name]
            if not p.maps(section, sym):
                continue
            t0 = time.time()
            try:
                rows = clean(p.candles(section, sym, tf, limit), tf)[-limit:]
                ms = int((time.time() - t0) * 1000)
                if len(rows) < 2:
                    raise ProviderError("no candles")
                p.metrics.record(True, ms, served=1)
                attempts.append({"provider": name, "ok": True, "ms": ms, "candles": len(rows)})
                if not best or len(rows) > len(best["candles"]):
                    best = {"symbol": sym, "tf": tf, "src": name, "srcLabel": p.label, "fallback": rank > 0, "candles": rows}
                if len(rows) >= enough:
                    break
            except Exception as e:
                ms = int((time.time() - t0) * 1000)
                p.metrics.record(False, ms, err=str(e)[:160])
                attempts.append({"provider": name, "ok": False, "ms": ms, "error": str(e)[:160]})
        if best:
            best["attempts"] = attempts
            rows = best["candles"]
            if tf in ("5m", "15m", "1h") and len(rows) > 1:
                expected = (rows[-1]["t"] - rows[0]["t"]) / TF_MS[tf]
                # Futures that trade only a few times a day (e.g. cotton): charts look torn on intraday timeframes.
                best["sparse"] = expected > 0 and len(rows) / expected < 0.15
            self.ccache[key] = (time.time() + self.CANDLE_TTL[tf], best)
            return best
        return {"symbol": sym, "tf": tf, "src": None, "candles": [], "attempts": attempts}

    # order book (crypto only) -------------------------------------
    BOOK_CHAIN = ("binance", "okx")
    BOOK_TTL = 1.5

    def book(self, sym, depth=12):
        if sym not in CG_IDS:
            return {"symbol": sym, "src": None, "bids": [], "asks": [], "attempts": []}
        key = ("book", sym, depth)
        hit = self.ccache.get(key)
        if hit and hit[0] > time.time():
            return hit[1]
        attempts = []
        for rank, name in enumerate(self.BOOK_CHAIN):
            if name not in self.providers or not self.usable(name):
                continue
            p = self.providers[name]; t0 = time.time()
            try:
                b = p.book(sym, depth); ms = int((time.time() - t0) * 1000)
                p.metrics.record(True, ms, served=1)
                attempts.append({"provider": name, "ok": True, "ms": ms})
                out = dict(b, symbol=sym, src=name, srcLabel=p.label, fallback=rank > 0, attempts=attempts)
                self.ccache[key] = (time.time() + self.BOOK_TTL, out)
                return out
            except Exception as e:
                ms = int((time.time() - t0) * 1000)
                p.metrics.record(False, ms, err=str(e)[:160])
                attempts.append({"provider": name, "ok": False, "ms": ms, "error": str(e)[:160]})
        return {"symbol": sym, "src": None, "bids": [], "asks": [], "attempts": attempts}

    # status / analytics ------------------------------------------
    def status(self):
        return {"sections": {s: {"chain": self.chains[s], "candleChain": CANDLE_CHAINS.get(s, self.chains[s]), "stats": self.section_stats[s]} for s in SECTIONS},
                "providers": {n: dict(p.info(), disabled=n in self.disabled) for n, p in self.providers.items()},
                "disabled": sorted(self.disabled)}

    BENCH = {"crypto": ["BTC/USD"], "stocks": ["AAPL"], "forex": ["EUR/USD"], "metals": ["XAU/USD"], "indices": ["SPX"], "commodities": ["USOIL"]}

    def benchmark(self):
        """Probe every provider of every section once with a sample symbol (bypasses caches)."""
        rows = []
        for section in SECTIONS:
            for name in self.chains[section]:
                p = self.providers[name]
                sym = self.BENCH[section][0]
                if not p.available():
                    rows.append({"section": section, "provider": name, "label": p.label, "ok": False, "error": "no API key"}); continue
                if hasattr(p, "bulk"):
                    p.bulk = (0, p.bulk[1])        # measure a real request, not the cache
                if hasattr(p, "table"):
                    p.table = (0, p.table[1])
                if isinstance(p, TwelveData):
                    with p.lock:
                        used_min = p._used()[0]
                    can = used_min < p.rpm
                else:
                    can = True
                if not p.maps(section, sym) or not can:
                    rows.append({"section": section, "provider": name, "label": p.label, "ok": False, "error": "skipped (limits/coverage)"}); continue
                t0 = time.time()
                try:
                    res = p.quotes(section, [sym]); ms = int((time.time() - t0) * 1000)
                    ok = sym in res
                    p.metrics.record(ok, ms, None if ok else "empty", 1 if ok else 0)
                    rows.append({"section": section, "provider": name, "label": p.label, "ok": ok, "ms": ms, "price": res.get(sym, {}).get("price")})
                except Exception as e:
                    ms = int((time.time() - t0) * 1000); p.metrics.record(False, ms, str(e)[:160])
                    rows.append({"section": section, "provider": name, "label": p.label, "ok": False, "ms": ms, "error": str(e)[:160]})
        return {"at": int(time.time() * 1000), "rows": rows}
