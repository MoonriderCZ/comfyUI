import json
import time
import requests

COMFY_URL = "http://127.0.0.1:8188"

def load_tasks():
    with open("tasks.json", "r") as f:
        return json.load(f)

def save_tasks(tasks):
    with open("tasks.json", "w") as f:
        json.dump(tasks, f, indent=4)

def send_to_comfy(payload):
    r = requests.post(f"{COMFY_URL}/prompt", json=payload)
    return r.json()["prompt_id"]

def wait_for_completion(prompt_id):
    while True:
        r = requests.get(f"{COMFY_URL}/history/{prompt_id}")
        data = r.json()
        if data.get("status") == "completed":
            return True
        time.sleep(1)

def run_tasks():
    tasks = load_tasks()

    for task in tasks["tasks"]:
        if task["status"] == "done":
            continue

        print(f"Spouštím úlohu {task['id']}")

        prompt_id = send_to_comfy(task["workflow"])
        wait_for_completion(prompt_id)

        task["status"] = "done"
        save_tasks(tasks)

        print(f"Úloha {task['id']} hotová")

if __name__ == "__main__":
    run_tasks()
