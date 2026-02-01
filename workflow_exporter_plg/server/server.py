from flask import Flask, request, jsonify, abort
from flask_cors import CORS, cross_origin
import datetime, json, os

# Konfigurace
API_KEY = None  # nastav na řetězec pro povinnou autentizaci, nebo None pro bez autentizace
OUT_DIR = "received_workflows"
MAX_BODY_BYTES = 5 * 1024 * 1024  # 5 MB limit

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_BODY_BYTES

# Povolit CORS pro všechny cesty, ale jen pro konkrétní originy
CORS(app, resources={r"/*": {"origins": ["http://127.0.0.1:8188", "http://localhost:8188"]}})

os.makedirs(OUT_DIR, exist_ok=True)

@app.route("/", methods=["GET"])
def index():
    return jsonify({"ok": True, "msg": "orchestrator alive"}), 200

# Explicitní handler pro preflight OPTIONS (vrátí 200 + CORS hlavičky)
@app.route("/workflow", methods=["OPTIONS"])
@cross_origin(origins=["http://127.0.0.1:8188", "http://localhost:8188"])
def workflow_options():
    return ("", 200)

# Skutečný POST endpoint (CORS povolený, API_KEY kontrola pouze zde)
@app.route("/workflow", methods=["POST"])
@cross_origin(origins=["http://127.0.0.1:8188", "http://localhost:8188"])
def workflow():
    # Volitelná kontrola API klíče (pouze pro POST)
    if API_KEY:
        key = request.headers.get("X-API-Key") or request.args.get("api_key")
        if key != API_KEY:
            abort(401)

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"ok": False, "error": "invalid_json"}), 400

    # Základní validace tvaru
    nodes = payload.get("nodes")
    if nodes is None or not isinstance(nodes, list):
        return jsonify({"ok": False, "error": "invalid_payload_nodes"}), 400

    ts = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    fname = os.path.join(OUT_DIR, f"workflow_{ts}.json")
    try:
        with open(fname, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return jsonify({"ok": False, "error": "save_failed", "msg": str(e)}), 500

    print(f"[{ts}] Received workflow saved to {fname}, nodes:", len(nodes))
    return jsonify({"ok": True, "saved": fname}), 200

if __name__ == "__main__":
    # Bind pouze na loopback pro bezpečnost
    app.run(host="127.0.0.1", port=5000, debug=True)
