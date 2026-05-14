import { escapeHtml } from "./helpers.js";

const BLOCKED_HTML_TAGS = "script, style, link, meta, iframe, object, embed, base";
const URL_ATTRIBUTE_NAMES = new Set(["href", "src", "xlink:href", "action", "formaction"]);

function sanitizeUrlAttribute(value) {
  const raw = String(value ?? "").trim();
  return /^javascript:/i.test(raw) ? "" : raw;
}

export function sanitizePortalCustomHtml(value = "") {
  const html = String(value ?? "");
  if (!html.trim()) return "";

  if (!globalThis.document) return escapeHtml(html);

  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll(BLOCKED_HTML_TAGS).forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        node.removeAttribute(attribute.name);
      } else if (URL_ATTRIBUTE_NAMES.has(name)) {
        const safeValue = sanitizeUrlAttribute(attribute.value);
        if (safeValue) node.setAttribute(attribute.name, safeValue);
        else node.removeAttribute(attribute.name);
      }
    }
  });

  return template.innerHTML;
}

function escapeCssString(value = "") {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function stripUnsafeCss(value = "") {
  return String(value ?? "")
    .replace(/<\/style/gi, "<\\/style")
    .replace(/@import[^;]+;/gi, "")
    .replace(/@charset[^;]+;/gi, "")
    .replace(/url\(\s*(['"]?)javascript:[^)]+\)/gi, "none");
}

function scopeCssSelectorList(selectorText, scopeSelector) {
  const selectors = [];
  let current = "";
  let depth = 0;
  let quote = "";
  for (let index = 0; index < selectorText.length; index += 1) {
    const char = selectorText[index];
    const previous = selectorText[index - 1];
    if (quote) {
      current += char;
      if (char === quote && previous !== "\\") quote = "";
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" ) depth += 1;
    else if ((char === ")" || char === "]") && depth > 0) depth -= 1;
    if (char === "," && depth === 0) {
      selectors.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) selectors.push(current);

  const scopedSelectors = selectors
    .map((selector) => selector.trim())
    .filter(Boolean)
    .map((selector) => {
      if (selector.startsWith(scopeSelector)) return selector;
      if (/^(html|body|:root)$/i.test(selector)) {
        return "";
      }
      if (/^(html|body|:root)(?=[\s>+~.#[:])/i.test(selector)) {
        return selector.replace(/^(html|body|:root)/i, scopeSelector);
      }
      if (selector.startsWith(":host") || selector.startsWith(":scope")) {
        return selector.replace(/^:(host|scope)/, scopeSelector);
      }
      if (selector.startsWith("&")) return `${scopeSelector}${selector.slice(1)}`;
      return `${scopeSelector} ${selector}`;
    })
    .filter(Boolean);
  return scopedSelectors
    .join(", ");
}

function findCssBlockStart(css, startIndex = 0) {
  let quote = "";
  let inComment = false;
  for (let index = startIndex; index < css.length; index += 1) {
    const char = css[index];
    const next = css[index + 1];
    const previous = css[index - 1];
    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      if (char === quote && previous !== "\\") quote = "";
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") return index;
  }
  return -1;
}

function findCssBlockEnd(css, openIndex = 0) {
  let depth = 0;
  let quote = "";
  let inComment = false;
  for (let index = openIndex; index < css.length; index += 1) {
    const char = css[index];
    const next = css[index + 1];
    const previous = css[index - 1];
    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      if (char === quote && previous !== "\\") quote = "";
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function scopePlainCss(css, scopeSelector) {
  const output = [];
  let index = 0;
  while (index < css.length) {
    const openIndex = findCssBlockStart(css, index);
    if (openIndex < 0) break;
    const prelude = css.slice(index, openIndex).trim();
    const closeIndex = findCssBlockEnd(css, openIndex);
    if (closeIndex < 0) break;
    const body = css.slice(openIndex + 1, closeIndex).trim();
    if (prelude && body) {
      if (/^@(keyframes|font-face|page|property)\b/i.test(prelude)) {
        output.push(`${prelude}{${body}}`);
      } else if (/^@(media|supports|container|layer)\b/i.test(prelude)) {
        const scopedBody = scopePlainCss(body, scopeSelector);
        if (scopedBody) output.push(`${prelude}{${scopedBody}}`);
      } else if (!prelude.startsWith("@")) {
        const scopedPrelude = scopeCssSelectorList(prelude, scopeSelector);
        if (scopedPrelude) output.push(`${scopedPrelude}{${body}}`);
      }
    }
    index = closeIndex + 1;
  }
  return output.join("\n");
}

export function scopePortalCustomCss(css = "", layerId = "") {
  const safeCss = stripUnsafeCss(css);
  if (!safeCss.trim() || !layerId) return "";
  const scopeSelector = `[data-portal-content-layer-id="${escapeCssString(layerId)}"] .tom-portal-content-layer__html`;
  return scopePlainCss(safeCss, scopeSelector);
}
