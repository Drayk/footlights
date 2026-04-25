import { MODULE_ID } from "../constants.js";

const GSAP_SCRIPT_PATH = `modules/${MODULE_ID}/scripts/vendor/gsap.min.js`;

let gsapLoadPromise = null;

export async function ensureGsap() {
  if (globalThis.gsap?.timeline) return globalThis.gsap;
  if (gsapLoadPromise) return gsapLoadPromise;

  gsapLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[data-tom-gsap-loader="true"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(globalThis.gsap), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("GSAP konnte nicht geladen werden.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GSAP_SCRIPT_PATH;
    script.async = true;
    script.dataset.tomGsapLoader = "true";
    script.addEventListener("load", () => {
      if (globalThis.gsap?.timeline) {
        resolve(globalThis.gsap);
        return;
      }
      reject(new Error("GSAP wurde geladen, aber window.gsap ist nicht verfuegbar."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("GSAP konnte nicht geladen werden.")), { once: true });
    document.head.appendChild(script);
  });

  return gsapLoadPromise;
}
