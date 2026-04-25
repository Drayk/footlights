import { MODULE_ID, SETTINGS } from "./constants.js";
import { LEGACY_TRANSLATION_ALIASES } from "./localization-legacy-aliases.js";

const DEFAULT_LANGUAGE = "en";
const META_KEYS = new Set(["__label", "__locale", "__aliases"]);

let activeLanguage = DEFAULT_LANGUAGE;
const translationCache = new Map();
let languageOptionsCache = null;

function normalizeLanguageCode(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "") || DEFAULT_LANGUAGE;
}

function buildLanguagePath(language) {
  return `modules/${MODULE_ID}/lang/${normalizeLanguageCode(language)}.json`;
}

function interpolateTranslation(template, replacements = {}) {
  return String(template ?? "").replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = replacements?.[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function defaultLanguageLabel(language) {
  const normalized = normalizeLanguageCode(language);
  try {
    const displayNames = new Intl.DisplayNames([game.i18n?.lang || "en"], { type: "language" });
    return displayNames.of(normalized) || normalized;
  } catch (_error) {
    return normalized.toUpperCase();
  }
}

async function fetchLanguageFile(language) {
  const normalized = normalizeLanguageCode(language);
  if (translationCache.has(normalized)) {
    return translationCache.get(normalized);
  }

  const response = await fetch(buildLanguagePath(normalized));
  if (!response.ok) {
    throw new Error(`Failed to load translation file for ${normalized}`);
  }

  const content = await response.json();
  translationCache.set(normalized, content && typeof content === "object" ? content : {});
  return translationCache.get(normalized);
}

function getLanguageTranslations(language = activeLanguage) {
  return translationCache.get(normalizeLanguageCode(language)) ?? {};
}

function getTranslationByKey(translations, key) {
  if (!translations || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(translations, key)) {
    return translations[key];
  }

  const segments = String(key).split(".").filter(Boolean);
  if (!segments.length) return undefined;

  let current = translations;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === "string" ? current : undefined;
}

function resolveTranslationKey(sourceText) {
  const rawKey = String(sourceText ?? "").trim();
  if (!rawKey) return "";

  const activeTranslations = getLanguageTranslations(activeLanguage);
  const defaultTranslations = getLanguageTranslations(DEFAULT_LANGUAGE);
  const activeAliases = activeTranslations?.__aliases ?? {};
  const defaultAliases = defaultTranslations?.__aliases ?? {};
  const legacyAlias = LEGACY_TRANSLATION_ALIASES?.[rawKey];

  if (Object.prototype.hasOwnProperty.call(activeTranslations, rawKey)) return rawKey;
  if (Object.prototype.hasOwnProperty.call(defaultTranslations, rawKey)) return rawKey;
  if (Object.prototype.hasOwnProperty.call(activeAliases, rawKey)) return String(activeAliases[rawKey] ?? "").trim() || rawKey;
  if (Object.prototype.hasOwnProperty.call(defaultAliases, rawKey)) return String(defaultAliases[rawKey] ?? "").trim() || rawKey;
  if (legacyAlias) return String(legacyAlias).trim() || rawKey;
  return rawKey;
}

async function discoverLanguageCodes() {
  const codes = new Set([DEFAULT_LANGUAGE]);

  const manifestLanguages = game.modules.get(MODULE_ID)?.languages ?? [];
  manifestLanguages.forEach((entry) => {
    const code = normalizeLanguageCode(entry?.lang || entry?.path?.split?.("/").pop()?.replace(/\.json$/i, ""));
    if (code) codes.add(code);
  });

  try {
    for (const source of ["public", "data"]) {
      const browseResult = await FilePicker.browse(source, `modules/${MODULE_ID}/lang`);
      (browseResult?.files ?? []).forEach((filePath) => {
        const match = String(filePath).match(/([^/\\]+)\.json$/i);
        if (!match) return;
        const code = normalizeLanguageCode(match[1]);
        if (code) codes.add(code);
      });
    }
  } catch (_error) {
    // fall back to manifest languages when directory listing is unavailable
  }

  return Array.from(codes);
}

export async function getLanguageOptions(forceRefresh = false) {
  if (!forceRefresh && Array.isArray(languageOptionsCache)) {
    return languageOptionsCache;
  }

  const codes = await discoverLanguageCodes();
  const options = await Promise.all(codes.map(async (code) => {
    try {
      const translations = await fetchLanguageFile(code);
      return {
        value: code,
        label: String(translations?.__label || defaultLanguageLabel(code)).trim() || code.toUpperCase()
      };
    } catch (_error) {
      return {
        value: code,
        label: defaultLanguageLabel(code)
      };
    }
  }));

  languageOptionsCache = options
    .filter((option) => option?.value)
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  return languageOptionsCache;
}

export function getActiveLanguage() {
  return activeLanguage;
}

export async function initializeLocalization() {
  const savedLanguage = game.settings?.settings?.has(`${MODULE_ID}.${SETTINGS.LANGUAGE}`)
    ? game.settings.get(MODULE_ID, SETTINGS.LANGUAGE)
    : DEFAULT_LANGUAGE;
  const options = await getLanguageOptions();
  const available = new Set(options.map((option) => option.value));
  const nextLanguage = available.has(normalizeLanguageCode(savedLanguage))
    ? normalizeLanguageCode(savedLanguage)
    : DEFAULT_LANGUAGE;

  await fetchLanguageFile(DEFAULT_LANGUAGE);
  activeLanguage = nextLanguage;
  await fetchLanguageFile(nextLanguage);
  return nextLanguage;
}

export async function setActiveLanguage(language) {
  const normalized = normalizeLanguageCode(language);
  await fetchLanguageFile(DEFAULT_LANGUAGE);
  activeLanguage = normalized;
  await fetchLanguageFile(normalized);
  return normalized;
}

export function translate(sourceText, replacements = {}, fallback = "") {
  const key = resolveTranslationKey(sourceText);
  if (!key) return String(fallback ?? "");

  return translateKey(key, replacements, fallback || key);
}

export function translateKey(key, replacements = {}, fallback = "") {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) return String(fallback ?? "");

  const translations = getLanguageTranslations(activeLanguage);
  const defaultTranslations = getLanguageTranslations(DEFAULT_LANGUAGE);
  const translated = getTranslationByKey(translations, normalizedKey)
    ?? getTranslationByKey(defaultTranslations, normalizedKey)
    ?? fallback
    ?? normalizedKey;
  return interpolateTranslation(translated, replacements);
}

export function registerLocalizationHelpers() {
  Handlebars.registerHelper("tr", function translationHelper(sourceText, options = {}) {
    const replacements = options?.hash ?? {};
    const cleanedReplacements = Object.fromEntries(
      Object.entries(replacements).filter(([key]) => !META_KEYS.has(key))
    );
    return translate(sourceText, cleanedReplacements);
  });

  Handlebars.registerHelper("trKey", function translationKeyHelper(key, options = {}) {
    const replacements = options?.hash ?? {};
    const cleanedReplacements = Object.fromEntries(
      Object.entries(replacements).filter(([entryKey]) => !META_KEYS.has(entryKey))
    );
    return translateKey(key, cleanedReplacements);
  });
}

function translateAttribute(element, attributeName) {
  if (!(element instanceof HTMLElement)) return;
  const value = element.getAttribute(attributeName);
  if (!value || /\{.+\}/.test(value)) return;
  const translated = translate(value);
  if (translated && translated !== value) {
    element.setAttribute(attributeName, translated);
  }
}

export function translateDomSubtree(rootElement) {
  const root = rootElement instanceof HTMLElement ? rootElement : rootElement?.[0];
  if (!(root instanceof HTMLElement)) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text)) return NodeFilter.FILTER_REJECT;
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest?.("script, style")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    textNodes.push(currentNode);
    currentNode = walker.nextNode();
  }

  textNodes.forEach((node) => {
    const original = node.textContent;
    const trimmed = original?.trim?.();
    if (!trimmed || /\{.+\}/.test(trimmed)) return;
    const translated = translate(trimmed);
    if (!translated || translated === trimmed) return;
    node.textContent = original.replace(trimmed, translated);
  });

  root.querySelectorAll("*").forEach((element) => {
    ["title", "aria-label", "placeholder", "alt"].forEach((attributeName) => {
      translateAttribute(element, attributeName);
    });
  });
}
