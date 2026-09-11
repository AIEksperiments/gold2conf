from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import sys
import webbrowser
import threading

root = Path(__file__).resolve().parent
os.chdir(root)

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
url = f"http://localhost:{port}"

print(f"Grand Grains Control Panel: {url}")
print("Press Ctrl+C to stop.")

threading.Timer(0.7, lambda: webbrowser.open(url)).start()
ThreadingHTTPServer(("127.0.0.1", port), SimpleHTTPRequestHandler).serve_forever()
