"""Lifecycle integration tests; each test uses its own temporary port and files."""
import http.client
import json
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import AppServer

ROOT = Path(__file__).resolve().parents[1]


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "index.html").write_text("<h1>test</h1>")
        (root / "js").mkdir()
        (root / "js" / "app.js").write_text("/* public asset */")
        (root / "private.txt").write_text("private fixture")
        (root / "js" / "escape.js").symlink_to(root / "private.txt")
        self.server = AppServer(0, root)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": .05}, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.stop()
        self.thread.join(timeout=2)
        self.server.server_close()
        self.tmp.cleanup()

    def request(self, method, path, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        merged = {"Host": "localhost:" + str(self.port)}
        merged.update(headers or {})
        conn.request(method, path, headers=merged)
        response = conn.getresponse()
        result = response.status, response.read()
        conn.close()
        return result

    def auth(self):
        return {"Origin": self.server.origin, "X-Staff-Token": self.server.token}

    def test_identity_and_loopback_only(self):
        code, data = self.request("GET", "/__app/status")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(data)["app"], "bangumi-staff-analyzer")
        self.assertEqual(self.server.server_address[0], "127.0.0.1")
        self.assertEqual(self.request("GET", "/")[0], 200)
        self.assertEqual(self.request("GET", "/js/app.js")[0], 200)
        self.assertEqual(self.request("HEAD", "/js/app.js"), (200, b""))

    def test_shutdown_rejects_foreign_requests(self):
        cases = [
            {},
            {"Origin": self.server.origin, "X-Staff-Token": "wrong"},
            {"Origin": "https://example.com", "X-Staff-Token": self.server.token},
            {**self.auth(), "Host": "attacker.example"},
            {**self.auth(), "Sec-Fetch-Site": "cross-site"},
        ]
        for headers in cases:
            with self.subTest(headers=headers):
                self.assertEqual(self.request("POST", "/__app/shutdown", headers)[0], 403)
                self.assertFalse(self.server.stopping.is_set())
        self.assertEqual(self.request("GET", "/__app/shutdown")[0], 404)
        self.assertEqual(self.request("GET", "/__app/status", {"Host": "attacker.example"})[0], 403)

    def test_shutdown_stops_serving(self):
        code, body = self.request("POST", "/__app/shutdown", self.auth())
        self.assertEqual(code, 200)
        self.assertTrue(json.loads(body)["stopping"])
        self.thread.join(timeout=2)
        self.assertFalse(self.thread.is_alive())

    def test_private_files_and_traversal_are_not_served(self):
        for path in ["/server.py", "/.git/config", "/js/", "/private.txt",
                     "/js/escape.js", "/../private.txt", "/%2e%2e/etc/passwd"]:
            with self.subTest(path=path):
                self.assertEqual(self.request("GET", path)[0], 404)

    def test_port_conflict_does_not_replace_existing_server(self):
        with self.assertRaises(OSError):
            AppServer(self.port, self.tmp.name)
        self.assertEqual(self.request("GET", "/")[0], 200)


class ProcessTests(unittest.TestCase):
    def port(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    def wait_port(self, port, listening):
        end = time.monotonic() + 5
        while time.monotonic() < end:
            with socket.socket() as sock:
                sock.settimeout(.1)
                open_now = sock.connect_ex(("127.0.0.1", port)) == 0
            if open_now == listening:
                return True
            time.sleep(.05)
        return False

    def test_signal_exit_releases_port(self):
        port = self.port()
        process = subprocess.Popen([sys.executable, str(ROOT / "server.py"), "--port", str(port)],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            self.assertTrue(self.wait_port(port, True))
            process.terminate()
            process.wait(timeout=3)
            self.assertEqual(process.returncode, 0)
            self.assertTrue(self.wait_port(port, False))
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stderr.close()

    def test_parent_death_releases_port(self):
        port = self.port()
        code = (
            "import os,subprocess,sys,time;"
            "p=subprocess.Popen([sys.executable,sys.argv[1],'--port',sys.argv[2],"
            "'--parent-pid',str(os.getpid())],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);"
            "print(p.pid,flush=True);time.sleep(30)"
        )
        parent = subprocess.Popen([sys.executable, "-c", code, str(ROOT / "server.py"), str(port)],
                                  stdout=subprocess.PIPE, text=True)
        child_pid = int(parent.stdout.readline())
        try:
            self.assertTrue(self.wait_port(port, True))
            parent.kill()
            parent.wait(timeout=2)
            self.assertTrue(self.wait_port(port, False), "orphan server must stop itself")
        finally:
            if parent.poll() is None:
                parent.kill()
                parent.wait()
            parent.stdout.close()
            if not self.wait_port(port, False):
                import os
                os.kill(child_pid, signal.SIGTERM)


if __name__ == "__main__":
    unittest.main(verbosity=2)
