#!/usr/bin/env python3
"""Loopback-only static server with an authenticated, app-scoped shutdown."""
import argparse
import functools
import json
import os
from pathlib import Path
import secrets
import signal
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

APP_ID = "bangumi-staff-analyzer"
VERSION = "1.9.1"


class AppServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, port, root):
        self.root = Path(root).resolve()
        self.token = secrets.token_urlsafe(32)
        self.instance = secrets.token_hex(16)
        self.stopping = threading.Event()
        handler = functools.partial(AppHandler, directory=str(self.root))
        super().__init__(("127.0.0.1", port), handler)
        self.origin = "http://localhost:" + str(self.server_port)

    def stop(self):
        if not self.stopping.is_set():
            self.stopping.set()
            threading.Thread(target=self.shutdown, daemon=True).start()


class AppHandler(SimpleHTTPRequestHandler):
    server_version = "StaffAnalyzer/" + VERSION

    def log_message(self, fmt, *args):
        # The launcher captures stderr for startup failures; normal requests are quiet.
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def trusted_host(self):
        port = str(self.server.server_port)
        return self.headers.get("Host") in ("localhost:" + port, "127.0.0.1:" + port)

    def trusted_request(self):
        return (self.trusted_host()
                and self.headers.get("Sec-Fetch-Site", "same-origin") != "cross-site"
                and self.headers.get("Origin", self.server.origin) == self.server.origin)

    def respond(self, status, data):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def do_GET(self):
        if not self.trusted_request():
            self.respond(403, {"error": "Forbidden"})
            return
        if urlsplit(self.path).path == "/__app/status":
            self.respond(200, {
                "app": APP_ID, "version": VERSION, "instance": self.server.instance,
                "token": self.server.token, "stopping": self.server.stopping.is_set()
            })
            return
        if self.headers.get("Host", "").startswith("127.0.0.1:"):
            # Keep the browser storage origin identical to the old launcher.
            self.send_response(302)
            self.send_header("Location", self.server.origin + "/")
            self.end_headers()
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.trusted_request():
            self.respond(403, {"error": "Forbidden"})
            return
        super().do_HEAD()

    def do_POST(self):
        if urlsplit(self.path).path != "/__app/shutdown":
            self.respond(404, {"error": "Not found"})
            return
        supplied = self.headers.get("X-Staff-Token", "")
        if (not self.trusted_request()
                or self.headers.get("Origin") != self.server.origin
                or not secrets.compare_digest(supplied, self.server.token)):
            self.respond(403, {"error": "Forbidden"})
            return
        self.respond(200, {"stopping": True})
        self.wfile.flush()
        self.server.stop()

    def send_head(self):
        path = unquote(urlsplit(self.path).path).lstrip("/") or "index.html"
        candidate = (self.server.root / path).resolve()
        try:
            relative = candidate.relative_to(self.server.root)
        except ValueError:
            self.send_error(404)
            return None
        # Never expose project sources, .git, logs, or directory listings.
        if (not candidate.is_file() or
                (relative.as_posix() != "index.html" and
                 (relative.parts[0] not in ("js", "css", "assets") or
                  candidate.suffix not in (".js", ".css", ".svg", ".png", ".icns")))):
            self.send_error(404)
            return None
        return super().send_head()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--parent-pid", type=int)
    args = parser.parse_args()
    try:
        server = AppServer(args.port, args.root)
    except OSError as error:
        parser.exit(1, "无法启动本地服务（端口可能已被占用）：" + str(error) + "\n")
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: server.stop())
    if args.parent_pid:
        def watch_parent():
            while not server.stopping.wait(1):
                if os.getppid() != args.parent_pid:
                    server.stop()
                    return
        threading.Thread(target=watch_parent, daemon=True).start()
    try:
        server.serve_forever(poll_interval=0.1)
    finally:
        server.stopping.set()
        server.server_close()


if __name__ == "__main__":
    main()
