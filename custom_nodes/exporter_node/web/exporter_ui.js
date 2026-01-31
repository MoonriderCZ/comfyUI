import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "WorkflowExporter.UI",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "WorkflowExporter") return;

        console.log("Registering WorkflowExporter UI extension");

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            console.log("WorkflowExporter node created");

            // Add Export button
            this.addWidget("button", "Export", null, () => {
                this.run();

                // Notification
                const msg = document.createElement("div");
                msg.textContent = "Workflow export completed";
                msg.style.position = "fixed";
                msg.style.bottom = "20px";
                msg.style.right = "20px";
                msg.style.padding = "10px 15px";
                msg.style.background = "rgba(0,0,0,0.85)";
                msg.style.color = "white";
                msg.style.borderRadius = "6px";
                msg.style.zIndex = 9999;
                msg.style.fontSize = "14px";
                document.body.appendChild(msg);

                setTimeout(() => msg.remove(), 2500);
            });

            // Resize node to fit button
            this.setSize([this.size[0], this.computeSize()[1]]);

            return result;
        };
    }
});
