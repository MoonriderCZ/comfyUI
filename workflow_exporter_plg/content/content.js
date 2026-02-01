// content.js — nahraď celý soubor tímto
(function () {
  console.log("[ComfyUI Exporter] content script loaded at", new Date().toISOString());
  console.log("[ComfyUI Exporter] running on", window.location.href);

  // --- inject page script (runs in page context, má přístup k window.app) ---
  // Prefer externí injected.js (obchází CSP a je spolehlivější).
  // Ujisti se, že soubor content/injected.js existuje v balíčku rozšíření.
  (function injectPageScript() {
    try {
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL("content/injected.js");
      (document.head || document.documentElement).appendChild(s);
      s.onload = () => {
        console.debug("[ComfyUI Exporter] injected.js loaded and removed");
        s.remove();
      };
    } catch (e) {
      console.warn("[ComfyUI Exporter] failed to inject external script, falling back to inline injection", e);
      // Fallback inline injection (pokud externí načtení selže) — méně spolehlivé kvůli CSP
      const injectedCode = `
        (function() {
          if (window.__COMFYUI_EXPORTER_INJECTED) return;
          window.__COMFYUI_EXPORTER_INJECTED = true;
          function serializeGraphSafe() {
            try {
              if (!window.app || !window.app.graph) return { error: "no_graph" };
              const raw = window.app.graph.serialize();
              return { ok: true, payload: raw };
            } catch (e) {
              return { error: "serialize_error", message: e && e.message ? e.message : String(e) };
            }
          }
          window.addEventListener("message", (ev) => {
            if (!ev.data || ev.data.type !== "COMFYUI_EXPORTER_REQUEST") return;
            const resp = serializeGraphSafe();
            window.postMessage({ type: "COMFYUI_EXPORTER_RESPONSE", requestId: ev.data.requestId, result: resp }, "*");
          }, false);
          // signal ready
          try {
            if (window.app && window.app.graph) {
              window.postMessage({ type: "COMFYUI_EXPORTER_READY" }, "*");
            } else {
              let tries = 0;
              const t = setInterval(() => {
                tries++;
                if (window.app && window.app.graph) {
                  window.postMessage({ type: "COMFYUI_EXPORTER_READY" }, "*");
                  clearInterval(t);
                } else if (tries > 120) {
                  clearInterval(t);
                }
              }, 250);
            }
          } catch(e) {}
        })();
      `;
      const s2 = document.createElement("script");
      s2.textContent = injectedCode;
      (document.head || document.documentElement).appendChild(s2);
      s2.remove();
    }
  })();

  // --- komunikace: prefer DOM CustomEvent bridge (spolehlivější mezi světy) ---
  let readySignalReceived = false;

  // Listen for readiness signalled by injected page script via DOM event
  document.addEventListener("COMFYUI_EXPORTER_READY", () => {
    readySignalReceived = true;
    console.log("[ComfyUI Exporter] page signalled READY (via DOM event)");
  }, false);

  // Backwards-compatible: také posloucháme window.postMessage odpovědi pokud injected používá postMessage
  // (tento blok udrží starší implementace funkční)
  let pendingResponses = new Map();
  window.addEventListener("message", (ev) => {
    try {
      if (!ev.data) return;
      const d = ev.data;
      if (d.type === "COMFYUI_EXPORTER_RESPONSE" && d.requestId) {
        const resolver = pendingResponses.get(d.requestId);
        if (resolver) {
          resolver(d.result);
          pendingResponses.delete(d.requestId);
        }
      } else if (d.type === "COMFYUI_EXPORTER_READY") {
        readySignalReceived = true;
        console.log("[ComfyUI Exporter] page signalled READY (via postMessage)");
      }
    } catch (e) {
      console.debug("[ComfyUI Exporter] message listener error", e);
    }
  }, false);

  // --- DOM bridge: request/response přes CustomEvent ---
  function requestGraphViaDOM(timeout = 4000) {
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);

      function onResp(ev) {
        try {
          const d = ev.detail || {};
          if (d.requestId !== requestId) return;
          document.removeEventListener("COMFYUI_EXPORTER_RESPONSE", onResp);
          resolve(d.result);
        } catch (e) {
          document.removeEventListener("COMFYUI_EXPORTER_RESPONSE", onResp);
          resolve({ error: "response_handler_error", message: String(e) });
        }
      }

      // Listen for DOM response
      document.addEventListener("COMFYUI_EXPORTER_RESPONSE", onResp);

      // Dispatch request as DOM CustomEvent
      try {
        document.dispatchEvent(new CustomEvent("COMFYUI_EXPORTER_REQUEST", { detail: { requestId } }));
      } catch (e) {
        document.removeEventListener("COMFYUI_EXPORTER_RESPONSE", onResp);
        resolve({ error: "dispatch_failed", message: String(e) });
        return;
      }

      // Fallback timeout
      setTimeout(() => {
        document.removeEventListener("COMFYUI_EXPORTER_RESPONSE", onResp);
        resolve({ timeout: true });
      }, timeout);
    });
  }

  // --- starší postMessage fallback (pokud injected používá postMessage) ---
  function requestGraphFromPage(timeout = 3000) {
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        pendingResponses.delete(requestId);
        resolve({ timeout: true });
      }, timeout);

      pendingResponses.set(requestId, (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      });

      try {
        window.postMessage({ type: "COMFYUI_EXPORTER_REQUEST", requestId }, "*");
      } catch (e) {
        clearTimeout(timer);
        pendingResponses.delete(requestId);
        resolve({ error: "post_failed", message: String(e) });
      }
    });
  }

  // čekání na signál nebo na přítomnost window.app.graph
  async function waitForAppGraph(timeoutMs = 15000, pollMs = 200) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (readySignalReceived) return true;
      if (window.app && window.app.graph) return true;
      await new Promise(r => setTimeout(r, pollMs));
    }
    return false;
  }

  // robustní získání serializovaného grafu s retry — používá DOM bridge primárně, fallback na postMessage
  async function requestGraphWithRetries(maxAttempts = 12, attemptDelay = 500) {
    for (let i = 1; i <= maxAttempts; i++) {
      console.debug(`[ComfyUI Exporter] requestGraph attempt ${i}/${maxAttempts}`);
      const ready = await waitForAppGraph(2000, 150);
      if (!ready) {
        console.debug("[ComfyUI Exporter] requestGraph: app.graph not ready yet");
        await new Promise(r => setTimeout(r, attemptDelay));
        continue;
      }

      // 1) zkus DOM bridge
      const respDom = await requestGraphViaDOM(3000);
      if (respDom && respDom.ok && respDom.payload) {
        console.debug("[ComfyUI Exporter] requestGraph result (DOM): success, nodes:", (respDom.payload.nodes||[]).length);
        return { ok: true, raw: respDom.payload };
      }
      console.debug("[ComfyUI Exporter] requestGraph result (DOM):", respDom);

      // 2) fallback na postMessage (pokud injected používá postMessage)
      const respMsg = await requestGraphFromPage(3000);
      if (respMsg && respMsg.ok && respMsg.payload) {
        console.debug("[ComfyUI Exporter] requestGraph result (postMessage): success, nodes:", (respMsg.payload.nodes||[]).length);
        return { ok: true, raw: respMsg.payload };
      }
      console.debug("[ComfyUI Exporter] requestGraph result (postMessage):", respMsg);

      await new Promise(r => setTimeout(r, attemptDelay));
    }
    return { ok: false, timeout: true };
  }

  // --- diagnostika a retry (upravené) ---
  async function extractCleanWorkflowViaPage() {
    const res = await requestGraphWithRetries(12, 500);
    if (!res.ok) {
      console.warn("[ComfyUI Exporter] extractCleanWorkflowViaPage: timed out, no graph");
      return null;
    }

    try {
      const raw = res.raw;
      const clean = {
        id: raw.id || null,
        metadata: raw.properties || {},
        nodes: [],
      };
      for (const n of raw.nodes || []) {
        clean.nodes.push({
          id: n.id,
          type: n.type,
          inputs: n.inputs || {},
          widgets: n.widgets_values || []
        });
      }
      console.log("[ComfyUI Exporter] extractCleanWorkflowViaPage: success, nodes:", clean.nodes.length);
      return clean;
    } catch (e) {
      console.error("[ComfyUI Exporter] extractCleanWorkflowViaPage: transform failed", e);
      return null;
    }
  }

  async function sendWorkflow() {
    console.log("[ComfyUI Exporter] sendWorkflow invoked on", window.location.href, "time:", new Date().toISOString());
    const wf = await extractCleanWorkflowViaPage();
    if (!wf) {
      console.error("[ComfyUI Exporter] sendWorkflow aborted: failed to extract workflow from page");
      return;
    }

    console.log("[ComfyUI Exporter] sending workflow payload (trimmed):", { id: wf.id, nodes: wf.nodes.length });

    try {
      const res = await fetch("http://localhost:5000/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wf)
      });
      console.log("[ComfyUI Exporter] sent workflow, status:", res.status, "time:", new Date().toISOString());
    } catch (e) {
      console.error("[ComfyUI Exporter] failed to send workflow:", e);
    }
  }

  // --- UI tlačítko s diagnostikou a odolností proti DOM změnám ---
  function injectButton() {
    const id = "comfyui-exporter-button";
    if (document.getElementById(id)) return;
    const btn = document.createElement("button");
    btn.id = id;
    btn.textContent = "Export Workflow → Orchestrátor";
    btn.style.position = "fixed";
    btn.style.bottom = "10px";
    btn.style.right = "10px";
    btn.style.zIndex = 9999;
    btn.style.padding = "6px 10px";
    btn.style.background = "#222";
    btn.style.color = "#fff";
    btn.style.border = "1px solid #555";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";

    btn.addEventListener("click", async () => {
      console.log("[ComfyUI Exporter] button clicked event — href:", window.location.href, "time:", new Date().toISOString());
      await sendWorkflow();
    });

    // bezpečně přidat tlačítko až je body dostupné
    const attach = () => {
      if (document.body) {
        document.body.appendChild(btn);
        console.log("[ComfyUI Exporter] injectButton: button injected at", window.location.href);
        return true;
      }
      return false;
    };

    if (!attach()) {
      const obs = new MutationObserver(() => {
        if (attach()) obs.disconnect();
      });
      obs.observe(document.documentElement || document, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    injectButton();
  } else {
    window.addEventListener("load", injectButton);
  }

  // periodická diagnostika (pouze pro ladění)
  const diagInterval = setInterval(() => {
    console.log("[ComfyUI Exporter] periodic diag — href:", window.location.href, "time:", new Date().toISOString());
  }, 5000);

  // cleanup on unload
  window.addEventListener("beforeunload", () => {
    clearInterval(diagInterval);
  });

})();
