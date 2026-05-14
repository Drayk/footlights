import { translate as tr } from "../localization.js";

const CATEGORY_ID_PATTERN = /[^a-z0-9-_]+/g;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function getDefaultWorldMapCategories() {
  return [
    { id: "settlement", name: tr("Settlement"), iconClass: "fa-house", color: "#2f4057" },
    { id: "location", name: tr("Location"), iconClass: "fa-location-dot", color: "#33475f" },
    { id: "poi", name: tr("Point of interest"), iconClass: "fa-star", color: "#39455c" },
    { id: "headquarters", name: tr("Headquarters"), iconClass: "fa-shield-halved", color: "#3c4259" }
  ];
}

export function normalizeWorldMapCategory(categoryData = {}) {
  const fallback = getDefaultWorldMapCategories()[0];
  const id = String(categoryData.id || categoryData.name || fallback.id)
    .trim()
    .toLowerCase()
    .replace(CATEGORY_ID_PATTERN, "-");
  const color = String(categoryData.color || "").trim();
  return {
    id: id || fallback.id,
    name: String(categoryData.name || fallback.name).trim() || fallback.name,
    iconClass: String(categoryData.iconClass || fallback.iconClass).trim() || fallback.iconClass,
    color: HEX_COLOR_PATTERN.test(color) ? color.toLowerCase() : fallback.color
  };
}

export function collectWorldMapCategorySource(worldMap = {}) {
  if (Array.isArray(worldMap?.categories) && worldMap.categories.length) {
    return worldMap.categories;
  }
  return [
    ...(Array.isArray(worldMap?.pinCategories) ? worldMap.pinCategories : []),
    ...(Array.isArray(worldMap?.objectCategories) ? worldMap.objectCategories : []),
    ...(Array.isArray(worldMap?.regionCategories) ? worldMap.regionCategories : [])
  ];
}

export function normalizeWorldMapCategoryList(categorySource = []) {
  const source = Array.isArray(categorySource) && categorySource.length
    ? categorySource
    : getDefaultWorldMapCategories();
  return Array.from(new Map(
    source
      .map((entry) => normalizeWorldMapCategory(entry))
      .map((entry) => [entry.id, entry])
  ).values());
}

export function getWorldMapCategories(worldMap = {}) {
  const source = collectWorldMapCategorySource(worldMap);
  return normalizeWorldMapCategoryList(source);
}

export function getWorldMapCategoryOptions(worldMap = {}, {
  fallbackLabel = tr("Category"),
  fallbackIcon = "fa-location-dot",
  fallbackColor = "#33475f"
} = {}) {
  return getWorldMapCategories(worldMap ?? {}).map((entry) => ({
    id: String(entry.id || "").trim().toLowerCase(),
    value: String(entry.id || "").trim().toLowerCase(),
    label: String(entry.name || fallbackLabel).trim() || fallbackLabel,
    iconClass: String(entry.iconClass || fallbackIcon).trim() || fallbackIcon,
    color: String(entry.color || fallbackColor).trim().toLowerCase()
  }));
}

export function getWorldMapCategoryDefinitions(worldMap = {}, options = {}) {
  return Object.fromEntries(getWorldMapCategoryOptions(worldMap, options).map((entry) => [entry.id, entry]));
}

export function getWorldMapCategoryDefinition(worldMap = {}, categoryId = "", {
  fallbackValue = "location",
  fallbackLabel = tr("Location"),
  fallbackIcon = "fa-location-dot"
} = {}) {
  const definitions = getWorldMapCategoryDefinitions(worldMap, { fallbackLabel, fallbackIcon });
  const fallback = Object.values(definitions)[0] ?? {
    id: fallbackValue,
    value: fallbackValue,
    label: fallbackLabel,
    iconClass: fallbackIcon,
    color: "#33475f"
  };
  return definitions[String(categoryId || fallback.value).trim().toLowerCase()] ?? fallback;
}

export function getWorldMapCategoryLabel(worldMap = {}, categoryId = "", fallbackLabel = tr("General")) {
  const normalizedId = String(categoryId || "").trim().toLowerCase();
  const match = getWorldMapCategoryOptions(worldMap).find((entry) => entry.id === normalizedId);
  return match?.label || String(categoryId || fallbackLabel).trim() || fallbackLabel;
}

export function normalizeWorldMapLockedCategories(lockedCategoriesInput = {}, allowedCategories = new Set()) {
  const allowed = allowedCategories instanceof Set ? allowedCategories : new Set(allowedCategories);
  const normalizeValues = (values) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => value && allowed.has(value))
  ));
  return {
    categories: normalizeValues([
      ...(Array.isArray(lockedCategoriesInput.categories) ? lockedCategoriesInput.categories : []),
      ...(Array.isArray(lockedCategoriesInput.pins) ? lockedCategoriesInput.pins : []),
      ...(Array.isArray(lockedCategoriesInput.objects) ? lockedCategoriesInput.objects : []),
      ...(Array.isArray(lockedCategoriesInput.regions) ? lockedCategoriesInput.regions : [])
    ]),
    pins: [],
    objects: [],
    regions: []
  };
}
