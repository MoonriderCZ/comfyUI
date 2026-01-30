import time
import requests
import subprocess

RESTART_CMD = r"D:\programovani\comfy\ComfyUI\restart_comfyui.cmd"
CHECK_URL = "http://127.0.0.1:8188"
FAIL_LIMIT = 3

fail_count = 0

while True:
    try:
        requests.get(CHECK_URL, timeout=3)
        fail_count = 0
    except:
        fail_count += 1
        print(f"Watchdog: fail {fail_count}/{FAIL_LIMIT}")

        if fail_count >= FAIL_LIMIT:
            print("Watchdog: ComfyUI nereaguje, restartuji...")
            subprocess.Popen([RESTART_CMD], shell=True)
            fail_count = 0

    time.sleep(10)
