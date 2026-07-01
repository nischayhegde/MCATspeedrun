# Copyright: Ankitects Pty Ltd and contributors
# License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

"""Walk the MCAT SPA via the running webview and report what each route renders."""
import json
import sys
import time
import urllib.request

import websocket  # type: ignore

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def find_target():
    data = json.loads(urllib.request.urlopen("http://127.0.0.1:8080/json").read())
    for t in data:
        if t.get("title") == "main webview":
            return t["webSocketDebuggerUrl"]
    raise SystemExit("main webview not found")


class CDP:
    def __init__(self, url):
        self.ws = websocket.create_connection(
            url, max_size=None, suppress_origin=True,
            header=["Origin: http://localhost:8080"],
        )
        self._id = 0
        self.events = []

    def cmd(self, method, params=None, timeout=15):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        self.ws.settimeout(timeout)
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                return msg
            if "method" in msg:
                self.events.append(msg)

    def ev(self, expr, timeout=20):
        r = self.cmd(
            "Runtime.evaluate",
            {"expression": expr, "returnByValue": True, "awaitPromise": True},
            timeout=timeout,
        )
        res = r.get("result", {})
        if "exceptionDetails" in res:
            return {"__exc__": res["exceptionDetails"].get("text")}
        return res.get("result", {}).get("value")

    def console(self):
        out = []
        for e in self.events:
            m = e["method"]
            if m == "Runtime.consoleAPICalled":
                t = e["params"]["type"]
                if t in ("error", "warning"):
                    args = e["params"].get("args", [])
                    out.append(f"[{t}] " + " ".join(str(a.get("value", a.get("description",""))) for a in args))
            elif m == "Runtime.exceptionThrown":
                out.append("[exc] " + e["params"]["exceptionDetails"].get("text", ""))
            elif m == "Log.entryAdded":
                en = e["params"]["entry"]
                if en.get("level") in ("error", "warning"):
                    out.append(f"[log {en['level']}] {en.get('text')} ({en.get('url','')})")
        self.events = []
        return out


def wait_route(cdp, want_path, seconds=15):
    end = time.time() + seconds
    while time.time() < end:
        p = cdp.ev("location.pathname")
        ready = cdp.ev("document.readyState")
        if isinstance(p, str) and p.rstrip("/") == want_path.rstrip("/") and ready == "complete":
            time.sleep(1.2)  # let load fn + render settle
            return True
        time.sleep(0.4)
    return False


def report(cdp, label):
    print(f"\n===== {label} =====")
    print("URL:", cdp.ev("location.href"))
    body = cdp.ev("document.body ? document.body.innerText : 'NO BODY'")
    print("--- body innerText (first 700) ---")
    print((body or "")[:700])
    imgs = cdp.ev("Array.from(document.images).map(i=>({src:i.getAttribute('src'), w:i.naturalWidth, h:i.naturalHeight})).slice(0,6)")
    print("--- images ---")
    print(json.dumps(imgs, indent=2))
    btns = cdp.ev("Array.from(document.querySelectorAll('button')).map(b=>b.innerText.trim()).filter(Boolean).slice(0,15)")
    print("--- buttons ---", json.dumps(btns))
    errs = cdp.console()
    print("--- console errors/warnings ---")
    for e in errs:
        print("  ", e)


def main():
    cdp = CDP(find_target())
    cdp.cmd("Runtime.enable")
    cdp.cmd("Log.enable")

    for route, label in [
        ("/mcat", "DASHBOARD"),
        ("/mcat/study", "STUDY"),
        ("/mcat/diagnostic", "DIAGNOSTIC"),
    ]:
        cdp.ev(f"location.href={json.dumps(route)}")
        ok = wait_route(cdp, route, 20)
        if not ok:
            print(f"\n[!] route {route} did not become ready; current:", cdp.ev("location.pathname"))
        report(cdp, label)

    # return to dashboard
    cdp.ev("location.href='/mcat'")
    wait_route(cdp, "/mcat", 15)
    print("\n[done] returned to dashboard")


if __name__ == "__main__":
    main()
