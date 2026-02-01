// content/injected.js (page context)
(function(){
  if (window.__COMFYUI_EXPORTER_INJECTED) return;
  window.__COMFYUI_EXPORTER_INJECTED = true;
  console.log("[injected] loaded");

  function serializeGraphSafe() {
    try {
      if (!window.app || !window.app.graph) return { error: "no_graph" };
      return { ok: true, payload: window.app.graph.serialize() };
    } catch (e) {
      return { error: "serialize_error", message: String(e) };
    }
  }

  // Listen for DOM CustomEvent requests from content script
  document.addEventListener("COMFYUI_EXPORTER_REQUEST", (ev) => {
    const requestId = ev.detail && ev.detail.requestId;
    const result = serializeGraphSafe();
    // Odpověď posíláme jako CustomEvent
    document.dispatchEvent(new CustomEvent("COMFYUI_EXPORTER_RESPONSE", { detail: { requestId, result } }));
  }, false);

  // Optional: signal readiness přes DOM event
  function readyCheck() {
    if (window.app && window.app.graph) {
      document.dispatchEvent(new CustomEvent("COMFYUI_EXPORTER_READY"));
      return true;
    }
    return false;
  }
  if (!readyCheck()) {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (readyCheck() || tries > 120) clearInterval(t);
    }, 250);
  }
})();
