"""Serve the AR UI and the wound classifier on one port.

    python -m src.vision.server [port]      # default 5173

POST /api/classify  (body: JPEG/PNG bytes)  ->  JSON from WoundClassifier.predict
Everything else is a static file from src/ui.
"""
import json
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .wound_model import WoundClassifier

UI = Path(__file__).resolve().parents[1] / "ui"
clf = WoundClassifier()


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/classify":
            return self.send_error(404)
        try:
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            out = json.dumps(clf.predict_bytes(body)).encode()
            self.send_response(200)
        except Exception as e:  # bad image etc.
            out = json.dumps({"error": str(e)}).encode()
            self.send_response(400)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    print(f"VisionER on http://localhost:{port}/")
    ThreadingHTTPServer(("", port), partial(Handler, directory=str(UI))).serve_forever()
