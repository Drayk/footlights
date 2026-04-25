import { MODULE_ID } from "../constants.js";

const LEAFLET_SCRIPT_PATH = `modules/${MODULE_ID}/scripts/vendor/leaflet.js`;
const LEAFLET_STYLE_PATH = `modules/${MODULE_ID}/styles/modules/leaflet.css`;

let leafletLoadPromise = null;

function ensureLeafletStylesheet() {
  const existing = document.querySelector("link[data-tom-leaflet-loader='true']");
  if (existing) return existing;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = LEAFLET_STYLE_PATH;
  link.dataset.tomLeafletLoader = "true";
  document.head.appendChild(link);
  return link;
}

export async function ensureLeaflet() {
  if (globalThis.L?.map) return globalThis.L;
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    ensureLeafletStylesheet();
    const existingScript = document.querySelector("script[data-tom-leaflet-loader='true']");
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (globalThis.L?.map) resolve(globalThis.L);
        else reject(new Error("Leaflet script loaded but window.L is unavailable."));
      }, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Leaflet could not be loaded.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_SCRIPT_PATH;
    script.async = true;
    script.dataset.tomLeafletLoader = "true";
    script.addEventListener("load", () => {
      if (globalThis.L?.map) {
        resolve(globalThis.L);
        return;
      }
      reject(new Error("Leaflet was loaded, but window.L is unavailable."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Leaflet could not be loaded.")), { once: true });
    document.head.appendChild(script);
  });

  return leafletLoadPromise;
}
