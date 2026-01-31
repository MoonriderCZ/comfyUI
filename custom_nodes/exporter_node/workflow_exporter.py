import json
import os
import re
from server import PromptServer

class WorkflowExporter:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "export_path": ("STRING", {
                    "default": "C:/shots/shot_{num}.json",
                    "multiline": False
                })
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "export_workflow"
    CATEGORY = "Marian/Tools"

    def export_workflow(self, export_path):
        # Automatické číslování
        if "{num}" in export_path:
            directory = os.path.dirname(export_path)
            os.makedirs(directory, exist_ok=True)

            # Regex pro hledání existujících souborů
            pattern = re.escape(export_path).replace("\\{num\\}", r"(\d+)")
            regex = re.compile(pattern)

            max_num = 0
            for filename in os.listdir(directory):
                match = regex.match(os.path.join(directory, filename))
                if match:
                    num = int(match.group(1))
                    max_num = max(max_num, num)

            next_num = max_num + 1
            export_path = export_path.replace("{num}", f"{next_num:03d}")

        else:
            # vytvoření adresáře
            directory = os.path.dirname(export_path)
            if directory and not os.path.exists(directory):
                os.makedirs(directory, exist_ok=True)

        # Získání workflow
        workflow = PromptServer.instance.get_current_graph()

        # Uložení JSON
        with open(export_path, "w", encoding="utf-8") as f:
            json.dump(workflow, f, indent=2, ensure_ascii=False)

        print(f"[WorkflowExporter] Export hotov: {export_path}")

        return ()


NODE_CLASS_MAPPINGS = {
    "WorkflowExporter": WorkflowExporter
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "WorkflowExporter": "Workflow Exporter"
}
