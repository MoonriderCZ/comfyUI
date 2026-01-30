import json
import requests
import os
import time

COMFY_URL = "http://127.0.0.1:8188"


# ---------------------------------------------------------
# Načtení workflow šablony
# ---------------------------------------------------------
def load_workflow(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------
# Sestavení payloadu pro ComfyUI
# ---------------------------------------------------------
def build_payload(workflow: dict):
    # Workflow už je kompletní, jen ho zabalíme do "prompt"
    return {"prompt": workflow}


# ---------------------------------------------------------
# Odeslání payloadu do ComfyUI (s retry)
# ---------------------------------------------------------
def send_to_comfy(payload: dict, retries=9999):
    for attempt in range(retries):
        try:
            r = requests.post(f"{COMFY_URL}/prompt", json=payload, timeout=5)
            r.raise_for_status()
            return r.json()
        except Exception:
            print(f"[ComfyUI offline] Attempt {attempt+1}, retrying in 5s...")
            time.sleep(5)

    return {"error": "ComfyUI unreachable after many retries"}


# ---------------------------------------------------------
# Hlavní funkce executoru – dynamický výběr workflow
# ---------------------------------------------------------
def run_task(task_path: str):
    # Načti task (zatím potřebujeme jen název workflowu)
    with open(task_path, "r", encoding="utf-8") as f:
        task = json.load(f)

    workflow_name = task["workflow"]
    workflow_path = os.path.join("workflows", workflow_name)

    # Načti workflow
    workflow = load_workflow(workflow_path)

    # Sestav payload
    payload = build_payload(workflow)

    # Pošli do ComfyUI
    result = send_to_comfy(payload)

    return result
