from http.server import BaseHTTPRequestHandler, HTTPServer
import subprocess
import socket

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

if is_port_in_use(5000):
    print("Restart server already running.")
    exit()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/restart":
            subprocess.Popen(["D:\\programovani\\comfy\\ComfyUI\\restart.cmd"], shell=True)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ComfyUI restarting...")
        else:
            self.send_response(404)
            self.end_headers()

server = HTTPServer(("0.0.0.0", 5000), Handler)
print("Restart server running on port 5000")
server.serve_forever()
