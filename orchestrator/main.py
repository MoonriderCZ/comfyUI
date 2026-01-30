import os
import time
from backend.core.executor import run_task

TASKS_DIR = "tasks/"


def main():
    while True:
        # Najdi všechny tasky
        files = sorted(f for f in os.listdir(TASKS_DIR) if f.endswith(".json"))
        if not files:
            print("All tasks completed")
            break

        task_file = files[0]
        task_path = os.path.join(TASKS_DIR, task_file)

        print(f"\n--- Running task: {task_file} ---")

        # Retry loop – čeká, dokud ComfyUI není online
        while True:
            result = run_task(task_path)

            if "error" in result:
                print("ComfyUI offline or error occurred. Retrying in 5 seconds...")
                time.sleep(5)
                continue

            # Úspěch → ukonči retry loop
            break

        print("Task sent successfully:", result)

        # Task je hotový → smaž ho
        os.remove(task_path)
        print(f"Task {task_file} removed\n")


if __name__ == "__main__":
    main()
