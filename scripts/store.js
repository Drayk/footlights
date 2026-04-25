import { MODULE_ID, SETTINGS, DEFAULT_MINDMAP_STATE, DEFAULT_RUNTIME_STATE, DEFAULT_THEME_STATE, DEFAULT_STAGE_GOBLIN_STATE, DEFAULT_AVATAR_LIBRARY_STATE, DEFAULT_SOUND_LIBRARY_STATE, DEFAULT_WORLD_MAP_LIBRARY_STATE, BUILTIN_THEME_PRESETS } from "./constants.js";
import { duplicateData, normalizeProfiles, normalizeSceneTags, normalizeScenes, normalizeRuntimeState, randomId } from "./helpers.js";
import { getLanguageOptions, setActiveLanguage, translate as tr } from "./localization.js";

export class TheatreStore {
  static _normalizePublicAssetPath(path) {
    const normalized = String(path || "").trim().replaceAll("\\", "/");
    if (!normalized) return "";
    if (/^(?:https?:)?\/\//i.test(normalized)) return normalized;
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
  }

  static _normalizeThemeStop(stop = {}, fallback = {}) {
    const color = /^#[0-9a-f]{6}$/i.test(String(stop?.color ?? ""))
      ? String(stop.color)
      : fallback.color;
    const alpha = Math.max(0, Math.min(1, Number(stop?.alpha)));
    return {
      color,
      alpha: Number.isFinite(alpha) ? alpha : fallback.alpha
    };
  }

  static _normalizeThemeBranch(source = {}, defaults = {}, keys = []) {
    return Object.fromEntries(
      keys.map((key) => [key, this._normalizeThemeStop(source?.[key], defaults[key])])
    );
  }

  static _normalizeThemeSize(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(0.62, Math.min(2.4, numericValue));
  }

  static _normalizeThemeNumber(value, fallback, min = 0, max = 100) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(min, Math.min(max, numericValue));
  }

  static _normalizeThemeSizeBranch(source = {}, defaults = {}, keys = []) {
    return Object.fromEntries(
      keys.map((key) => [key, this._normalizeThemeSize(source?.[key], defaults[key])])
    );
  }

  static _normalizeThemeChoice(value, fallback, allowedValues = []) {
    const normalizedValue = String(value ?? "").trim();
    return allowedValues.includes(normalizedValue) ? normalizedValue : fallback;
  }

  static _normalizeThemeBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;
    const normalizedValue = String(value ?? "").trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalizedValue)) return true;
    if (["false", "0", "no", "off", ""].includes(normalizedValue)) return false;
    return Boolean(fallback);
  }

  static _normalizeThemeFontChoice(value, fallback = "") {
    const normalizedValue = String(value ?? "").trim();
    return normalizedValue || fallback;
  }

  static _normalizeThemeImageSet(source = {}, defaults = {}, keyPrefix, {
    alphaFallback = null,
    scaleFallback = null,
    repeatFallback = null
  } = {}) {
    return {
      [`${keyPrefix}Image`]: String(source?.[`${keyPrefix}Image`] || defaults[`${keyPrefix}Image`] || "").trim(),
      [`${keyPrefix}ImageAlpha`]: this._normalizeThemeNumber(
        source?.[`${keyPrefix}ImageAlpha`],
        alphaFallback ?? defaults[`${keyPrefix}ImageAlpha`],
        0,
        1
      ),
      [`${keyPrefix}ImageScale`]: this._normalizeThemeNumber(
        source?.[`${keyPrefix}ImageScale`],
        scaleFallback ?? defaults[`${keyPrefix}ImageScale`],
        0.1,
        4
      ),
      [`${keyPrefix}ImageRepeat`]: this._normalizeThemeChoice(
        source?.[`${keyPrefix}ImageRepeat`],
        repeatFallback ?? defaults[`${keyPrefix}ImageRepeat`],
        ["no-repeat", "repeat", "repeat-x", "repeat-y"]
      )
    };
  }

  static _normalizeThemeActionVariant(source = {}, defaults = {}, variantKey, {
    backgroundFallback = null,
    borderFallback = null,
    textFallback = null,
    iconFallback = null,
    borderWidthFallback = null,
    radiusFallback = null,
    iconSizeFallback = null
  } = {}) {
    const normalized = {};

    if (`${variantKey}Bg` in defaults) {
      normalized[`${variantKey}Bg`] = this._normalizeThemeStop(
        source?.[`${variantKey}Bg`],
        backgroundFallback ?? defaults[`${variantKey}Bg`]
      );
    }
    if (`${variantKey}Border` in defaults) {
      normalized[`${variantKey}Border`] = this._normalizeThemeStop(
        source?.[`${variantKey}Border`],
        borderFallback ?? defaults[`${variantKey}Border`]
      );
    }
    if (`${variantKey}Text` in defaults) {
      normalized[`${variantKey}Text`] = this._normalizeThemeStop(
        source?.[`${variantKey}Text`],
        textFallback ?? defaults[`${variantKey}Text`]
      );
    }
    if (`${variantKey}Icon` in defaults) {
      normalized[`${variantKey}Icon`] = this._normalizeThemeStop(
        source?.[`${variantKey}Icon`],
        iconFallback ?? defaults[`${variantKey}Icon`]
      );
    }
    if (`${variantKey}BorderWidth` in defaults) {
      normalized[`${variantKey}BorderWidth`] = this._normalizeThemeNumber(
        source?.[`${variantKey}BorderWidth`],
        borderWidthFallback ?? defaults[`${variantKey}BorderWidth`],
        0,
        8
      );
    }
    if (`${variantKey}Radius` in defaults) {
      normalized[`${variantKey}Radius`] = this._normalizeThemeNumber(
        source?.[`${variantKey}Radius`],
        radiusFallback ?? defaults[`${variantKey}Radius`],
        0,
        40
      );
    }
    if (`${variantKey}IconSize` in defaults) {
      normalized[`${variantKey}IconSize`] = this._normalizeThemeSize(
        source?.[`${variantKey}IconSize`],
        iconSizeFallback ?? defaults[`${variantKey}IconSize`]
      );
    }

    return normalized;
  }

  static _normalizeThemeState(theme = {}) {
    const defaults = duplicateData(DEFAULT_THEME_STATE);
    return {
      typography: {
        ...this._normalizeThemeSizeBranch(theme?.typography, defaults.typography, [
          "heading1",
          "heading2",
          "heading2Hover",
          "heading3",
          "body",
          "subText",
          "subTextHover",
          "microText",
          "navigationSize"
        ]),
        heading1Font: this._normalizeThemeFontChoice(theme?.typography?.heading1Font, defaults.typography.heading1Font),
        heading2Font: this._normalizeThemeFontChoice(theme?.typography?.heading2Font, defaults.typography.heading2Font),
        heading3Font: this._normalizeThemeFontChoice(theme?.typography?.heading3Font, defaults.typography.heading3Font),
        bodyFont: this._normalizeThemeFontChoice(theme?.typography?.bodyFont, defaults.typography.bodyFont),
        subTextFont: this._normalizeThemeFontChoice(theme?.typography?.subTextFont, defaults.typography.subTextFont),
        microTextFont: this._normalizeThemeFontChoice(theme?.typography?.microTextFont, defaults.typography.microTextFont),
        navigationFont: this._normalizeThemeFontChoice(theme?.typography?.navigationFont, defaults.typography.navigationFont)
      },
      navigation: {
        ...this._normalizeThemeBranch(theme?.navigation, defaults.navigation, [
          "surfaceStart",
          "surfaceEnd",
          "cardStart",
          "cardEnd",
          "titleBarStart",
          "titleBarEnd",
          "border1",
          "border2",
          "buttonStart",
          "buttonEnd",
          "buttonBorder",
          "buttonHoverStart",
          "buttonHoverEnd",
          "buttonHoverBorder",
          "buttonActiveStart",
          "buttonActiveEnd",
          "buttonActiveBorder",
          "divider",
          "shellDivider",
          "actionSafeBg",
          "actionSafeBorder",
          "actionSafeIcon",
          "actionCreateBg",
          "actionCreateBorder",
          "actionCreateText",
          "actionSettingsBg",
          "actionSettingsBorder",
          "actionSettingsIcon",
          "text",
          "mutedText",
          "headerRule",
          "icon",
          "iconHover",
          "iconActive"
        ]),
        ...this._normalizeThemeImageSet(theme?.navigation, defaults.navigation, "surface"),
        ...this._normalizeThemeImageSet(theme?.navigation, defaults.navigation, "card"),
        cardRadius: this._normalizeThemeNumber(theme?.navigation?.cardRadius, defaults.navigation.cardRadius, 0, 40),
        cardBlurEnabled: this._normalizeThemeBoolean(theme?.navigation?.cardBlurEnabled, defaults.navigation.cardBlurEnabled),
        border1Width: this._normalizeThemeNumber(theme?.navigation?.border1Width, defaults.navigation.border1Width, 0, 8),
        border2Width: this._normalizeThemeNumber(theme?.navigation?.border2Width, defaults.navigation.border2Width, 0, 8),
        buttonBorderWidth: this._normalizeThemeNumber(theme?.navigation?.buttonBorderWidth, defaults.navigation.buttonBorderWidth, 0, 8),
        buttonHoverBorderWidth: this._normalizeThemeNumber(theme?.navigation?.buttonHoverBorderWidth, defaults.navigation.buttonHoverBorderWidth, 0, 8),
        buttonActiveBorderWidth: this._normalizeThemeNumber(theme?.navigation?.buttonActiveBorderWidth, defaults.navigation.buttonActiveBorderWidth, 0, 8),
        tabRadius: this._normalizeThemeNumber(theme?.navigation?.tabRadius, defaults.navigation.tabRadius, 0, 30),
        ...this._normalizeThemeActionVariant(theme?.navigation, defaults.navigation, "actionSafe", {
          borderWidthFallback: theme?.navigation?.buttonBorderWidth,
          radiusFallback: theme?.navigation?.tabRadius
        }),
        ...this._normalizeThemeActionVariant(theme?.navigation, defaults.navigation, "actionSettings", {
          backgroundFallback: theme?.navigation?.actionSafeBg ?? defaults.navigation.actionSafeBg,
          borderFallback: theme?.navigation?.buttonBorder ?? defaults.navigation.buttonBorder,
          iconFallback: theme?.navigation?.text ?? defaults.navigation.text,
          borderWidthFallback: theme?.navigation?.buttonBorderWidth,
          radiusFallback: theme?.navigation?.tabRadius,
          iconSizeFallback: theme?.navigation?.actionSafeIconSize ?? defaults.navigation.actionSafeIconSize
        }),
        ...this._normalizeThemeActionVariant(theme?.navigation, defaults.navigation, "actionCreate", {
          backgroundFallback: theme?.navigation?.actionSafeBg ?? defaults.navigation.actionSafeBg,
          borderFallback: theme?.navigation?.buttonBorder ?? defaults.navigation.buttonBorder,
          textFallback: theme?.navigation?.text ?? defaults.navigation.text,
          borderWidthFallback: theme?.navigation?.buttonBorderWidth,
          radiusFallback: theme?.navigation?.tabRadius
        })
      },
      content: {
        ...this._normalizeThemeBranch(theme?.content, defaults.content, [
          "appBackground",
          "surfaceStart",
          "surfaceEnd",
          "container",
          "card",
          "cardHover",
          "formBackground",
          "divider",
          "scrollbar",
          "heading",
          "subheading",
          "buttonHoverHeading",
          "label",
          "text",
          "mutedText",
          "buttonHoverSubText",
          "headerRule",
          "horizontal2",
          "border1",
          "border2",
          "border3",
          "actionEditBg",
          "actionEditIcon",
          "actionDuplicateBg",
          "actionDuplicateIcon",
          "actionPlayBg",
          "actionPlayIcon",
          "actionDeleteBg",
          "actionDeleteIcon",
          "actionSidebarBg",
          "actionSidebarIcon",
          "actionGenericBg",
          "actionGenericText",
          "actionGenericBorder"
        ]),
        ...this._normalizeThemeImageSet(theme?.content, defaults.content, "appBackground"),
        ...this._normalizeThemeImageSet(theme?.content, defaults.content, "surface"),
        ...this._normalizeThemeImageSet(theme?.content, defaults.content, "container"),
        ...this._normalizeThemeImageSet(theme?.content, defaults.content, "card"),
        surfaceRadius: this._normalizeThemeNumber(theme?.content?.surfaceRadius, defaults.content.surfaceRadius, 0, 40),
        containerRadius: this._normalizeThemeNumber(theme?.content?.containerRadius, defaults.content.containerRadius, 0, 40),
        cardRadius: this._normalizeThemeNumber(theme?.content?.cardRadius, defaults.content.cardRadius, 0, 40),
        cardHoverRadius: this._normalizeThemeNumber(theme?.content?.cardHoverRadius, defaults.content.cardHoverRadius, 0, 40),
        formRadius: this._normalizeThemeNumber(theme?.content?.formRadius, defaults.content.formRadius, 0, 40),
        border1Width: this._normalizeThemeNumber(theme?.content?.border1Width, defaults.content.border1Width, 0, 8),
        border2Width: this._normalizeThemeNumber(theme?.content?.border2Width, defaults.content.border2Width, 0, 8),
        border3Width: this._normalizeThemeNumber(theme?.content?.border3Width, defaults.content.border3Width, 0, 8),
        ...this._normalizeThemeActionVariant(theme?.content, defaults.content, "actionGeneric"),
        ...this._normalizeThemeActionVariant(theme?.content, defaults.content, "actionEdit"),
        ...this._normalizeThemeActionVariant(theme?.content, defaults.content, "actionDuplicate", {
          backgroundFallback: theme?.content?.actionEditBg ?? defaults.content.actionEditBg,
          iconFallback: theme?.content?.actionEditIcon ?? defaults.content.actionEditIcon,
          iconSizeFallback: theme?.content?.actionEditIconSize ?? defaults.content.actionEditIconSize
        }),
        ...this._normalizeThemeActionVariant(theme?.content, defaults.content, "actionPlay"),
        ...this._normalizeThemeActionVariant(theme?.content, defaults.content, "actionDelete"),
        ...this._normalizeThemeActionVariant(theme?.content, defaults.content, "actionSidebar", {
          backgroundFallback: theme?.content?.actionGenericBg ?? defaults.content.actionGenericBg,
          iconFallback: theme?.content?.actionGenericText ?? defaults.content.actionGenericText,
          iconSizeFallback: theme?.content?.actionEditIconSize ?? defaults.content.actionSidebarIconSize
        })
      },
      planner: {
        ...this._normalizeThemeBranch(theme?.planner, defaults.planner, [
          "heading",
          "text",
          "handle",
          "actionIcon",
          "invertedHeading",
          "invertedText",
          "invertedHandle",
          "invertedActionIcon",
          "canvasStart",
          "canvasEnd",
          "gridPrimary",
          "gridSecondary",
          "toggleBg",
          "toggleIcon"
        ]),
        backdrop: this._normalizeThemeStop(theme?.planner?.backdrop ?? theme?.content?.overlay, defaults.planner.backdrop),
        backdropText: this._normalizeThemeStop(theme?.planner?.backdropText ?? theme?.content?.overlayText, defaults.planner.backdropText),
        separator: this._normalizeThemeStop(theme?.planner?.separator ?? theme?.content?.splitter, defaults.planner.separator)
      },
      stageGoblin: {
        ...this._normalizeThemeBranch(theme?.stageGoblin, defaults.stageGoblin, [
          "surface",
          "border",
          "icon"
        ]),
        borderWidth: this._normalizeThemeNumber(theme?.stageGoblin?.borderWidth, defaults.stageGoblin.borderWidth, 0, 6),
        radius: this._normalizeThemeNumber(theme?.stageGoblin?.radius, defaults.stageGoblin.radius, 0, 40),
        fontPreset: this._normalizeThemeChoice(theme?.stageGoblin?.fontPreset, defaults.stageGoblin.fontPreset, [
          "heading1",
          "heading2",
          "heading3",
          "body",
          "subText",
          "microText"
        ])
      },
      theatre: {
        ...this._normalizeThemeBranch(theme?.theatre, defaults.theatre, [
          "stageTitle",
          "stageSubtitle",
          "avatarName",
          "mood",
          "titleBackground",
          "avatarNameBackground",
          "moodBackground",
          "gmBarBackground",
          "container1",
          "container1Border",
          "container2",
          "container2Border",
          "container3",
          "container3Border",
          "iconBackground",
          "iconBorder",
          "iconColor",
          "stageFrame"
        ]),
        titleBackgroundRadius: this._normalizeThemeNumber(theme?.theatre?.titleBackgroundRadius, defaults.theatre.titleBackgroundRadius, 0, 999),
        ...this._normalizeThemeImageSet(theme?.theatre, defaults.theatre, "gmBar"),
        gmBarRadius: this._normalizeThemeNumber(theme?.theatre?.gmBarRadius, defaults.theatre.gmBarRadius, 0, 40),
        container1BorderWidth: this._normalizeThemeNumber(theme?.theatre?.container1BorderWidth, defaults.theatre.container1BorderWidth, 0, 8),
        container1Radius: this._normalizeThemeNumber(theme?.theatre?.container1Radius, defaults.theatre.container1Radius, 0, 40),
        container1BlurEnabled: this._normalizeThemeBoolean(theme?.theatre?.container1BlurEnabled, defaults.theatre.container1BlurEnabled),
        container2BorderWidth: this._normalizeThemeNumber(theme?.theatre?.container2BorderWidth, defaults.theatre.container2BorderWidth, 0, 8),
        container2Radius: this._normalizeThemeNumber(theme?.theatre?.container2Radius, defaults.theatre.container2Radius, 0, 40),
        container2BlurEnabled: this._normalizeThemeBoolean(theme?.theatre?.container2BlurEnabled, defaults.theatre.container2BlurEnabled),
        container3BorderWidth: this._normalizeThemeNumber(theme?.theatre?.container3BorderWidth, defaults.theatre.container3BorderWidth, 0, 8),
        container3Radius: this._normalizeThemeNumber(theme?.theatre?.container3Radius, defaults.theatre.container3Radius, 0, 40),
        container3BlurEnabled: this._normalizeThemeBoolean(theme?.theatre?.container3BlurEnabled, defaults.theatre.container3BlurEnabled),
        iconBorderWidth: this._normalizeThemeNumber(theme?.theatre?.iconBorderWidth, defaults.theatre.iconBorderWidth, 0, 8),
        stageTitleSize: this._normalizeThemeSize(theme?.theatre?.stageTitleSize, defaults.theatre.stageTitleSize),
        stageSubtitleSize: this._normalizeThemeSize(theme?.theatre?.stageSubtitleSize, defaults.theatre.stageSubtitleSize),
        avatarNameSize: this._normalizeThemeSize(theme?.theatre?.avatarNameSize, defaults.theatre.avatarNameSize),
        moodSize: this._normalizeThemeSize(theme?.theatre?.moodSize, defaults.theatre.moodSize),
        stageFrameWidth: this._normalizeThemeNumber(theme?.theatre?.stageFrameWidth, defaults.theatre.stageFrameWidth, 0, 8)
      }
    };
  }

  static _hexToRgbString(hex) {
    const normalized = String(hex ?? "").trim().replace(/^#/, "");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return "255, 255, 255";
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return `${red}, ${green}, ${blue}`;
  }

  static _extractHexColor(value, fallback = "#ffffff") {
    const explicit = String(value ?? "").trim();
    const hexMatch = explicit.match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) return `#${hexMatch[1]}`.toLowerCase();

    const rgbMatch = explicit.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      const toHex = (channel) => Math.max(0, Math.min(255, Number(channel) || 0)).toString(16).padStart(2, "0");
      return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`.toLowerCase();
    }

    return String(fallback || "#ffffff").toLowerCase();
  }

  static _extractColorAlpha(value, fallback = 1, min = 0, max = 1) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.max(min, Math.min(max, numeric));

    const match = String(value ?? "").match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/i);
    const parsed = match ? Number(match[1]) : NaN;
    if (Number.isFinite(parsed)) return Math.max(min, Math.min(max, parsed));

    return Math.max(min, Math.min(max, fallback));
  }

  static _composeRgbaColor(hex, alpha = 1) {
    return `rgba(${this._hexToRgbString(hex)}, ${alpha})`;
  }

  static _getDefaultMindmapNodeAccentStop(node = {}) {
    if (node?.type === "group") return { color: "#54c7c3", alpha: 0.18 };
    if (node?.type === "note") return { color: "#f2c778", alpha: 0.46 };
    if (node?.type === "theatreScene") return { color: "#54c7c3", alpha: 0.42 };
    if (node?.type === "worldMap") return { color: "#6fc5ff", alpha: 0.42 };
    if (node?.documentType === "Actor" || node?.documentType === "Token" || node?.documentType === "TokenDocument") return { color: "#6fc5ff", alpha: 0.42 };
    if (node?.documentType === "Item") return { color: "#f2c778", alpha: 0.42 };
    if (node?.documentType === "JournalEntry" || node?.documentType === "JournalEntryPage") return { color: "#b298ff", alpha: 0.42 };
    if (node?.documentType === "RollTable") return { color: "#86d18f", alpha: 0.42 };
    if (node?.documentType === "Macro") return { color: "#ffb86f", alpha: 0.42 };
    if (node?.documentType === "Scene") return { color: "#ff85b6", alpha: 0.42 };
    return { color: "#aebfd3", alpha: 0.42 };
  }

  static _getLegacyMindmapNodeTextStops(node = {}) {
    const theme = this.getThemeState();
    const useInvertedPalette = Boolean(node?.darkText);
    return {
      type: useInvertedPalette ? theme.planner.invertedText : theme.planner.text,
      title: useInvertedPalette ? theme.planner.invertedHeading : theme.planner.heading,
      text: useInvertedPalette ? theme.planner.invertedText : theme.planner.text,
      handle: useInvertedPalette ? theme.planner.invertedHandle : theme.planner.handle,
      action: useInvertedPalette ? theme.planner.invertedActionIcon : theme.planner.actionIcon
    };
  }

  static _normalizeMindmapColorToken(colorValue, alphaValue, fallbackStop, { minAlpha = 0, maxAlpha = 1 } = {}) {
    const fallbackColor = this._extractHexColor(fallbackStop?.color, "#ffffff");
    const fallbackAlpha = this._extractColorAlpha(fallbackStop?.alpha, 1, minAlpha, maxAlpha);
    const color = this._extractHexColor(colorValue, fallbackColor);
    const alpha = this._extractColorAlpha(alphaValue, this._extractColorAlpha(colorValue, fallbackAlpha, minAlpha, maxAlpha), minAlpha, maxAlpha);
    return {
      color: this._composeRgbaColor(color, alpha),
      alpha
    };
  }

  static _normalizeMindmapTextScale(value, fallback = 1) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(0.7, Math.min(1.8, numericValue));
  }

  static _extractMindmapNodeDesignFields(source = {}) {
    return {
      color: source.color,
      colorAlpha: source.colorAlpha,
      typeColor: source.typeColor,
      typeColorAlpha: source.typeColorAlpha,
      typeSize: source.typeSize,
      titleColor: source.titleColor,
      titleColorAlpha: source.titleColorAlpha,
      titleSize: source.titleSize,
      textColor: source.textColor,
      textColorAlpha: source.textColorAlpha,
      textSize: source.textSize,
      handleColor: source.handleColor,
      handleColorAlpha: source.handleColorAlpha,
      actionIconColor: source.actionIconColor,
      actionIconColorAlpha: source.actionIconColorAlpha,
      stageGoblinHatchColor: source.stageGoblinHatchColor,
      stageGoblinHatchColorAlpha: source.stageGoblinHatchColorAlpha
    };
  }

  static _normalizeMindmapNodeDesignPreset(preset = {}) {
    const normalizedNode = this._normalizeMindmapNode({
      type: "document",
      documentType: "Actor",
      ...preset
    });
    return {
      id: preset.id || randomId(),
      name: String(preset.name || tr("Preset")).trim() || tr("Preset"),
      ...this._extractMindmapNodeDesignFields(normalizedNode)
    };
  }

  static _normalizeThemePreset(preset = {}, { builtIn = false } = {}) {
    return {
      id: String(preset.id || randomId()).trim() || randomId(),
      name: String(preset.name || tr("Preset")).trim() || tr("Preset"),
      builtIn: builtIn || Boolean(preset.builtIn),
      theme: this._normalizeThemeState(preset.theme ?? preset.settings ?? {})
    };
  }

  static _normalizeMindmapNode(node = {}) {
    const legacyTextStops = this._getLegacyMindmapNodeTextStops(node);
    const accent = this._normalizeMindmapColorToken(
      node.color,
      node.colorAlpha,
      this._getDefaultMindmapNodeAccentStop(node),
      { minAlpha: 0.01, maxAlpha: 0.8 }
    );
    const typeColor = this._normalizeMindmapColorToken(
      node.typeColor,
      node.typeColorAlpha,
      node.type === "note" ? legacyTextStops.text : legacyTextStops.type
    );
    const titleColor = this._normalizeMindmapColorToken(node.titleColor, node.titleColorAlpha, legacyTextStops.title);
    const textColor = this._normalizeMindmapColorToken(node.textColor, node.textColorAlpha, legacyTextStops.text);
    const handleColor = this._normalizeMindmapColorToken(node.handleColor, node.handleColorAlpha, legacyTextStops.handle);
    const actionIconColor = this._normalizeMindmapColorToken(node.actionIconColor, node.actionIconColorAlpha, legacyTextStops.action);
    const stageGoblinHatchColor = this._normalizeMindmapColorToken(
      node.stageGoblinHatchColor,
      node.stageGoblinHatchColorAlpha,
      {
        color: this._getDefaultMindmapNodeAccentStop(node).color,
        alpha: 0.14
      }
    );
    const typeSize = this._normalizeMindmapTextScale(node.typeSize, 1);
    const titleSize = this._normalizeMindmapTextScale(node.titleSize, 1);
    const textSize = this._normalizeMindmapTextScale(node.textSize, 1);

    return {
      id: node.id || randomId(),
      type: node.type || "unknown",
      documentType: node.documentType || "",
      documentId: node.documentId || "",
      documentUuid: node.documentUuid || "",
      theatreSceneId: node.theatreSceneId || "",
      worldMapId: node.worldMapId || "",
      label: node.label || tr("Node"),
      noteContent: node.noteContent || "",
      tags: Array.isArray(node.tags)
        ? node.tags.map((tag) => String(tag ?? "").trim()).filter(Boolean).slice(0, 8)
        : [],
      x: Number(node.x) || 120,
      y: Number(node.y) || 120,
      width: Number(node.width) || 220,
      height: Number(node.height) || 84,
      pageId: node.pageId || "",
      noteExpanded: Boolean(node.noteExpanded),
      color: accent.color,
      colorAlpha: accent.alpha,
      typeColor: typeColor.color,
      typeColorAlpha: typeColor.alpha,
      typeSize,
      titleColor: titleColor.color,
      titleColorAlpha: titleColor.alpha,
      titleSize,
      textColor: textColor.color,
      textColorAlpha: textColor.alpha,
      textSize,
      handleColor: handleColor.color,
      handleColorAlpha: handleColor.alpha,
      actionIconColor: actionIconColor.color,
      actionIconColorAlpha: actionIconColor.alpha,
      stageGoblinHatchColor: stageGoblinHatchColor.color,
      stageGoblinHatchColorAlpha: stageGoblinHatchColor.alpha,
      darkText: Boolean(node.darkText),
      icon: node.icon || "",
      thumbnail: node.thumbnail || ""
    };
  }

  static _normalizeAdventurePlanner(planner = {}) {
    return {
      id: planner.id || randomId(),
      name: planner.name || tr("New Adventure Planner"),
      board: {
        width: Math.max(Number(planner.board?.width) || 0, 4800),
        height: Math.max(Number(planner.board?.height) || 0, 3200)
      },
      nodeDesignPresets: Array.isArray(planner.nodeDesignPresets)
        ? planner.nodeDesignPresets
            .filter((preset) => preset?.id)
            .slice(0, 10)
            .map((preset) => this._normalizeMindmapNodeDesignPreset(preset))
        : [],
      nodes: Array.isArray(planner.nodes)
        ? planner.nodes.filter((node) => node?.id).map((node) => this._normalizeMindmapNode(node))
        : [],
      edges: Array.isArray(planner.edges)
        ? planner.edges.filter((edge) => edge?.id && edge?.fromNodeId && edge?.toNodeId).map((edge) => ({
            id: edge.id,
            fromNodeId: edge.fromNodeId,
            toNodeId: edge.toNodeId,
            fromSide: edge.fromSide || "right",
            toSide: edge.toSide || "left",
            style: ["solid", "dashed", "dotted"].includes(edge.style) ? edge.style : "solid",
            color: edge.color || "rgba(110, 39, 48, 0.92)",
            colorAlpha: Math.max(0.01, Math.min(1, Number(edge.colorAlpha) || 0.92))
          }))
        : []
    };
  }

  static _normalizeAdventurePlannerCollection(state = {}) {
    if (Array.isArray(state?.planners)) {
      const planners = state.planners.map((planner) => this._normalizeAdventurePlanner(planner));
      const activePlannerId = planners.some((planner) => planner.id === state.activePlannerId)
        ? state.activePlannerId
        : (planners[0]?.id ?? null);
      return { planners, activePlannerId };
    }

    if (state?.board || Array.isArray(state?.nodes) || Array.isArray(state?.edges)) {
      const migratedPlanner = this._normalizeAdventurePlanner({
        id: randomId(),
        name: tr("Adventure Planner"),
        board: state.board,
        nodes: state.nodes,
        edges: state.edges
      });
      return {
        planners: [migratedPlanner],
        activePlannerId: migratedPlanner.id
      };
    }

    return duplicateData(DEFAULT_MINDMAP_STATE);
  }

  static _normalizeStageGoblinItem(item = {}) {
    return {
      id: item.id || randomId(),
      sourceType: item.sourceType === "plannerNode" ? "plannerNode" : "document",
      plannerId: item.sourceType === "plannerNode" ? String(item.plannerId || "") : "",
      nodeId: item.sourceType === "plannerNode" ? String(item.nodeId || "") : "",
      documentType: item.sourceType === "document" ? String(item.documentType || "") : "",
      documentId: item.sourceType === "document" ? String(item.documentId || "") : "",
      documentUuid: item.sourceType === "document" ? String(item.documentUuid || "") : "",
      label: String(item.label || "").trim() || tr("Entry")
    };
  }

  static _normalizeStageGoblinState(state = {}) {
    const planners = this.getAdventurePlanners?.() ?? [];
    const requestedPlannerId = String(state?.selectedPlannerId || "").trim();
    const selectedPlannerId = planners.some((planner) => planner.id === requestedPlannerId)
      ? requestedPlannerId
      : (planners.find((planner) => planner.id === this.getActiveAdventurePlanner?.()?.id)?.id ?? planners[0]?.id ?? null);
    return {
      position: {
        left: Math.max(0, Number(state?.position?.left) || DEFAULT_STAGE_GOBLIN_STATE.position.left),
        top: Math.max(0, Number(state?.position?.top) || DEFAULT_STAGE_GOBLIN_STATE.position.top),
        width: Math.max(240, Number(state?.position?.width) || DEFAULT_STAGE_GOBLIN_STATE.position.width),
        height: Math.max(44, Number(state?.position?.height) || DEFAULT_STAGE_GOBLIN_STATE.position.height)
      },
      collapsed: Boolean(state?.collapsed),
      selectedPlannerId,
      items: Array.isArray(state?.items)
        ? state.items
            .map((item) => this._normalizeStageGoblinItem(item))
            .filter((item) => (
              item.sourceType === "plannerNode"
                ? Boolean(item.plannerId && item.nodeId)
                : Boolean(item.documentUuid || item.documentId)
            ))
        : []
    };
  }

  static registerSettings(appClasses) {
    game.settings.register(MODULE_ID, SETTINGS.LANGUAGE, {
      name: "Footlights Language",
      scope: "world",
      config: false,
      type: String,
      default: "en",
      onChange: (value) => {
        void setActiveLanguage(value);
      }
    });

    game.settings.register(MODULE_ID, SETTINGS.PROFILES, {
      name: "Footlights Actor Profiles",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register(MODULE_ID, SETTINGS.SCENES, {
      name: "Footlights Scenes",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register(MODULE_ID, SETTINGS.AVATARS, {
      name: "Footlights Avatars",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register(MODULE_ID, SETTINGS.AVATAR_LIBRARY, {
      name: "Avatar Library State",
      scope: "world",
      config: false,
      type: Object,
      default: duplicateData(DEFAULT_AVATAR_LIBRARY_STATE)
    });

    game.settings.register(MODULE_ID, SETTINGS.SOUND_LIBRARY, {
      name: "Sound Library State",
      scope: "world",
      config: false,
      type: Object,
      default: duplicateData(DEFAULT_SOUND_LIBRARY_STATE)
    });

    game.settings.register(MODULE_ID, SETTINGS.MAP_LIBRARY, {
      name: "World Map Library State",
      scope: "world",
      config: false,
      type: Object,
      default: duplicateData(DEFAULT_WORLD_MAP_LIBRARY_STATE)
    });

    game.settings.register(MODULE_ID, SETTINGS.MOODS, {
      name: "Mood Presets",
      scope: "world",
      config: false,
      type: Array,
      default: ["neutral"]
    });

    game.settings.register(MODULE_ID, SETTINGS.THEME, {
      name: "Theme State",
      scope: "world",
      config: false,
      type: Object,
      default: duplicateData(DEFAULT_THEME_STATE)
    });

    game.settings.register(MODULE_ID, SETTINGS.THEME_PRESETS, {
      name: "Theme Presets",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register(MODULE_ID, SETTINGS.MINDMAP, {
      name: "Adventure Planner State",
      scope: "world",
      config: false,
      type: Object,
      default: duplicateData(DEFAULT_MINDMAP_STATE)
    });

    game.settings.register(MODULE_ID, SETTINGS.STAGE_GOBLIN, {
      name: "StageGoblin State",
      scope: "world",
      config: false,
      type: Object,
      default: duplicateData(DEFAULT_STAGE_GOBLIN_STATE)
    });

    game.settings.register(MODULE_ID, SETTINGS.RUNTIME, {
      name: "Footlights Runtime State",
      scope: "world",
      config: false,
      type: Object,
      default: duplicateData(DEFAULT_RUNTIME_STATE)
    });

    game.settings.registerMenu(MODULE_ID, "sceneLibraryMenu", {
      name: "Footlights Library",
      label: "Open Footlights Library",
      hint: "Manage Footlights scenes, avatars, maps, and settings.",
      icon: "fas fa-theater-masks",
      type: appClasses.sceneLibrary,
      restricted: true
    });
  }

  static getProfiles() {
    return normalizeProfiles(game.settings.get(MODULE_ID, SETTINGS.PROFILES));
  }

  static getLanguage() {
    return String(game.settings.get(MODULE_ID, SETTINGS.LANGUAGE) || "en").trim() || "en";
  }

  static async saveLanguage(language) {
    const options = await getLanguageOptions();
    const normalized = String(language || "").trim().toLowerCase();
    const fallbackLanguage = options.some((option) => option.value === "en") ? "en" : (options[0]?.value || "en");
    const nextLanguage = options.some((option) => option.value === normalized)
      ? normalized
      : fallbackLanguage;
    return game.settings.set(MODULE_ID, SETTINGS.LANGUAGE, nextLanguage);
  }

  static async saveProfiles(profiles) {
    return game.settings.set(MODULE_ID, SETTINGS.PROFILES, normalizeProfiles(profiles));
  }

  static getProfileByActorId(actorId) {
    return this.getProfiles().find((profile) => profile.actorId === actorId) ?? null;
  }

  static async upsertProfile(profileData) {
    const profiles = this.getProfiles();
    const index = profiles.findIndex((profile) => profile.actorId === profileData.actorId);
    const nextProfile = {
      actorId: profileData.actorId,
      defaultImage: profileData.defaultImage ?? "",
      moods: profileData.moods ?? {}
    };

    if (index === -1) profiles.push(nextProfile);
    else profiles[index] = nextProfile;

    return this.saveProfiles(profiles);
  }

  static getScenes() {
    return normalizeScenes(game.settings.get(MODULE_ID, SETTINGS.SCENES));
  }

  static getSceneById(sceneId) {
    return this.getScenes().find((scene) => scene.id === sceneId) ?? null;
  }

  static async saveScenes(scenes) {
    return game.settings.set(MODULE_ID, SETTINGS.SCENES, normalizeScenes(scenes));
  }

  static async upsertScene(sceneData) {
    const scenes = this.getScenes();
    const existingScene = scenes.find((scene) => scene.id === sceneData.id) ?? null;
    const nextScene = {
      id: sceneData.id || randomId(),
      name: sceneData.name || tr("New Footlights Scene"),
      stageTitle: sceneData.stageTitle || "",
      stageSubtitle: sceneData.stageSubtitle || "",
      description: String(sceneData.description || "").trim(),
      location: String(sceneData.location || "").trim(),
      tags: normalizeSceneTags(sceneData.tags),
      background: sceneData.background || "",
      thumbnail: sceneData.thumbnail || "",
      actors: Array.isArray(sceneData.actors) ? sceneData.actors : [],
        settings: {
          uiHidden: Boolean(sceneData.settings?.uiHidden),
          allowPlayerMoodChange: Boolean(sceneData.settings?.allowPlayerMoodChange),
          moodDisplayMode: ["all", "gm", "hidden"].includes(sceneData.settings?.moodDisplayMode)
            ? sceneData.settings.moodDisplayMode
            : "all",
          preserveBackgroundAspect: sceneData.settings?.preserveBackgroundAspect !== false,
          cinematicBars: ["standard", "small", "medium", "big"].includes(sceneData.settings?.cinematicBars)
            ? sceneData.settings.cinematicBars
            : "standard",
          backdropBlurEnabled: sceneData.settings?.backdropBlurEnabled !== false,
          backdropImage: String(sceneData.settings?.backdropImage || "").trim(),
          backdropImageScale: Number.isFinite(Number(sceneData.settings?.backdropImageScale))
            ? Math.max(0.1, Math.min(4, Number(sceneData.settings.backdropImageScale)))
            : 1,
          backdropImageRepeat: ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(sceneData.settings?.backdropImageRepeat)
            ? sceneData.settings.backdropImageRepeat
            : "repeat",
          backdropDarkness: Number.isFinite(Number(sceneData.settings?.backdropDarkness))
            ? Math.max(0, Math.min(0.92, Number(sceneData.settings.backdropDarkness)))
            : 0.2,
          backgroundDim: Number.isFinite(Number(sceneData.settings?.backgroundDim))
            ? Math.max(0, Math.min(0.92, Number(sceneData.settings.backgroundDim)))
            : (Number.isFinite(Number(existingScene?.settings?.backgroundDim))
              ? Math.max(0, Math.min(0.92, Number(existingScene.settings.backgroundDim)))
              : 0),
          transitionEffect: ["none", "blurZoom", "glitch", "scanlineBoot"].includes(sceneData.settings?.transitionEffect)
            ? sceneData.settings.transitionEffect
            : "none",
          transitionDuration: Number.isFinite(Number(sceneData.settings?.transitionDuration))
            ? Math.max(0.3, Math.min(2.8, Number(sceneData.settings.transitionDuration)))
            : 0.9,
          transitionIntensity: Number.isFinite(Number(sceneData.settings?.transitionIntensity))
            ? Math.max(0.6, Math.min(1.8, Number(sceneData.settings.transitionIntensity)))
            : 1,
          sharedLeftSidebarVisible: Boolean(sceneData.settings?.sharedLeftSidebarVisible),
          sharedRightSidebarVisible: Boolean(sceneData.settings?.sharedRightSidebarVisible)
        }
      };

    const index = scenes.findIndex((scene) => scene.id === nextScene.id);

    if (index === -1) scenes.push(nextScene);
    else scenes[index] = nextScene;

    await this.saveScenes(scenes);
    return nextScene;
  }

  static async deleteScene(sceneId) {
    const scenes = this.getScenes().filter((scene) => scene.id !== sceneId);
    await this.saveScenes(scenes);

    const runtime = this.getRuntimeState();
    if (runtime.activeSceneId === sceneId) {
      await this.saveRuntimeState(duplicateData(DEFAULT_RUNTIME_STATE));
    }
  }

  static async duplicateScene(sceneId) {
    const scene = this.getSceneById(sceneId);
    if (!scene) return null;

    const duplicatedScene = {
      ...duplicateData(scene),
      id: randomId(),
      name: `${scene.name || tr("FOOTLIGHTS SCENE")} ${tr("(Copy)")}`,
      actors: Array.isArray(scene.actors)
        ? scene.actors.map((actor) => ({
            ...duplicateData(actor),
            sceneActorId: randomId()
          }))
        : []
    };

    await this.upsertScene(duplicatedScene);
    return duplicatedScene;
  }

  static getMoodPresets() {
    const moods = game.settings.get(MODULE_ID, SETTINGS.MOODS);
    return Array.isArray(moods) ? moods : ["neutral"];
  }

  static async saveMoodPresets(moods) {
    const normalized = Array.from(new Set(
      (Array.isArray(moods) ? moods : [])
        .map((mood) => String(mood ?? "").trim())
        .filter(Boolean)
    )).slice(0, 8);

    return game.settings.set(MODULE_ID, SETTINGS.MOODS, normalized.length ? normalized : ["neutral"]);
  }

  static getThemeState() {
    return this._normalizeThemeState(game.settings.get(MODULE_ID, SETTINGS.THEME));
  }

  static async saveThemeState(theme) {
    return game.settings.set(MODULE_ID, SETTINGS.THEME, this._normalizeThemeState(theme));
  }

  static getBuiltinThemePresets() {
    return BUILTIN_THEME_PRESETS.map((preset) => this._normalizeThemePreset({
      ...preset,
      name: tr(preset.name)
    }, { builtIn: true }));
  }

  static getCustomThemePresets() {
    const presets = game.settings.get(MODULE_ID, SETTINGS.THEME_PRESETS);
    return Array.isArray(presets)
      ? presets.map((preset) => this._normalizeThemePreset(preset))
      : [];
  }

  static getThemePresets() {
    return [
      ...this.getBuiltinThemePresets(),
      ...this.getCustomThemePresets()
    ];
  }

  static async saveThemePresets(presets) {
    const normalizedPresets = Array.isArray(presets)
      ? presets.map((preset) => {
          const normalizedPreset = this._normalizeThemePreset(preset);
          return {
            id: normalizedPreset.id,
            name: normalizedPreset.name,
            theme: normalizedPreset.theme
          };
        })
      : [];

    return game.settings.set(MODULE_ID, SETTINGS.THEME_PRESETS, normalizedPresets);
  }

  static async createThemePreset(presetData = {}) {
    const presets = this.getCustomThemePresets();
    const nextPreset = this._normalizeThemePreset({
      ...presetData,
      id: presetData.id || randomId()
    });

    presets.push(nextPreset);
    await this.saveThemePresets(presets);
    return this.getCustomThemePresets().find((preset) => preset.id === nextPreset.id) ?? null;
  }

  static async updateThemePreset(presetId, patch = {}) {
    if (!presetId) return null;
    const presets = this.getCustomThemePresets();
    const presetIndex = presets.findIndex((preset) => preset.id === presetId);
    if (presetIndex === -1) return null;

    presets[presetIndex] = this._normalizeThemePreset({
      ...presets[presetIndex],
      ...patch,
      id: presetId
    });
    await this.saveThemePresets(presets);
    return this.getCustomThemePresets().find((preset) => preset.id === presetId) ?? null;
  }

  static async deleteThemePreset(presetId) {
    if (!presetId) return;
    const presets = this.getCustomThemePresets().filter((preset) => preset.id !== presetId);
    await this.saveThemePresets(presets);
  }

  static getAvatars() {
    const avatars = game.settings.get(MODULE_ID, SETTINGS.AVATARS);
    return Array.isArray(avatars)
      ? avatars.map((avatar) => this._normalizeAvatar(avatar))
      : [];
  }

  static getAvatarById(avatarId) {
    return this.getAvatars().find((avatar) => avatar.id === avatarId) ?? null;
  }

  static async saveAvatars(avatars) {
    return game.settings.set(
      MODULE_ID,
      SETTINGS.AVATARS,
      Array.isArray(avatars) ? avatars.map((avatar) => this._normalizeAvatar(avatar)) : []
    );
  }

  static async upsertAvatar(avatarData) {
    const avatars = this.getAvatars();
    const nextAvatar = this._normalizeAvatar({
      id: avatarData.id || randomId(),
      name: avatarData.name || tr("New Avatar"),
      actorId: avatarData.actorId || "",
      defaultImage: avatarData.defaultImage || "",
      moodImages: avatarData.moodImages ?? {},
      useCircularCrop: avatarData.useCircularCrop,
      circularCropScale: avatarData.circularCropScale,
      frameFitScale: avatarData.frameFitScale,
      frameImage: avatarData.frameImage || "",
      showBackdrop: avatarData.showBackdrop
    });

    const index = avatars.findIndex((avatar) => avatar.id === nextAvatar.id);
    if (index === -1) avatars.push(nextAvatar);
    else avatars[index] = nextAvatar;

    await this.saveAvatars(avatars);
    return nextAvatar;
  }

  static _normalizeAvatar(avatarData = {}) {
    const moodImages = avatarData.moodImages && typeof avatarData.moodImages === "object"
      ? Object.fromEntries(
        Object.entries(avatarData.moodImages)
          .map(([key, value]) => [String(key ?? "").trim(), String(value ?? "").trim()])
          .filter(([key]) => Boolean(key))
      )
      : {};

    return {
      id: String(avatarData.id || randomId()),
      name: String(avatarData.name || tr("New Avatar")).trim() || tr("New Avatar"),
      actorId: String(avatarData.actorId || "").trim(),
      defaultImage: String(avatarData.defaultImage || "").trim(),
      moodImages,
      useCircularCrop: Boolean(avatarData.useCircularCrop),
      circularCropScale: Math.max(0.7, Math.min(1.3, Number(avatarData.circularCropScale) || 1)),
      frameFitScale: Math.max(0.6, Math.min(1.2, Number(avatarData.frameFitScale) || 1)),
      frameImage: String(avatarData.frameImage || "").trim(),
      showBackdrop: avatarData.showBackdrop !== false
    };
  }

  static async deleteAvatar(avatarId) {
    const avatars = this.getAvatars().filter((avatar) => avatar.id !== avatarId);
    await this.saveAvatars(avatars);
  }

  static getAvatarLibraryState() {
    const state = game.settings.get(MODULE_ID, SETTINGS.AVATAR_LIBRARY);
    return {
      tokenDefaults: {
        frameImage: String(state?.tokenDefaults?.frameImage || DEFAULT_AVATAR_LIBRARY_STATE.tokenDefaults.frameImage).trim(),
        useCircularCrop: Boolean(state?.tokenDefaults?.useCircularCrop)
      }
    };
  }

  static async saveAvatarLibraryState(state = {}) {
    const normalized = {
      tokenDefaults: {
        frameImage: String(state?.tokenDefaults?.frameImage || "").trim(),
        useCircularCrop: Boolean(state?.tokenDefaults?.useCircularCrop)
      }
    };
    return game.settings.set(MODULE_ID, SETTINGS.AVATAR_LIBRARY, normalized);
  }

  static _normalizeSoundLibraryEntry(entry = {}) {
    return {
      id: String(entry.id || randomId()),
      label: String(entry.label || "").trim(),
      sourceType: entry.sourceType === "playlistSound" ? "playlistSound" : "file",
      path: String(entry.path || "").trim(),
      playlistId: String(entry.playlistId || "").trim(),
      soundId: String(entry.soundId || "").trim(),
      icon: String(entry.icon || "").trim()
    };
  }

  static _normalizeSoundPlaylist(playlistData = {}) {
    const tracks = Array.isArray(playlistData.tracks)
      ? playlistData.tracks.map((entry) => this._normalizeSoundLibraryEntry(entry)).filter((entry) => entry.sourceType === "file" ? entry.path : (entry.playlistId && entry.soundId))
      : [];
    const soundboard = Array.isArray(playlistData.soundboard)
      ? playlistData.soundboard
          .map((entry) => this._normalizeSoundLibraryEntry(entry))
          .filter((entry) => entry.sourceType === "file" ? entry.path : (entry.playlistId && entry.soundId))
          .slice(0, 10)
      : [];
    const sceneIds = Array.isArray(playlistData.sceneIds)
      ? Array.from(new Set(playlistData.sceneIds.map((id) => String(id || "").trim()).filter(Boolean)))
      : [];

    return {
      id: String(playlistData.id || randomId()),
      name: String(playlistData.name || tr("New Sound Playlist")).trim() || tr("New Sound Playlist"),
      globalPlayer: Boolean(playlistData.globalPlayer),
      sceneIds,
      tracks,
      soundboard
    };
  }

  static _normalizeSoundLibraryState(state = {}) {
    return {
      playlists: Array.isArray(state?.playlists)
        ? state.playlists.map((playlist) => this._normalizeSoundPlaylist(playlist))
        : []
    };
  }

  static getSoundLibraryState() {
    return this._normalizeSoundLibraryState(game.settings.get(MODULE_ID, SETTINGS.SOUND_LIBRARY));
  }

  static async saveSoundLibraryState(state = {}) {
    return game.settings.set(MODULE_ID, SETTINGS.SOUND_LIBRARY, this._normalizeSoundLibraryState(state));
  }

  static getSoundPlaylists() {
    return this.getSoundLibraryState().playlists;
  }

  static getGlobalSoundPlaylists() {
    return this.getSoundPlaylists().filter((playlist) => playlist.globalPlayer);
  }

  static getSoundPlaylistById(playlistId) {
    return this.getSoundPlaylists().find((playlist) => playlist.id === playlistId) ?? null;
  }

  static async upsertSoundPlaylist(playlistData = {}) {
    const state = this.getSoundLibraryState();
    const nextPlaylist = this._normalizeSoundPlaylist(playlistData);
    const index = state.playlists.findIndex((playlist) => playlist.id === nextPlaylist.id);
    if (index === -1) state.playlists.push(nextPlaylist);
    else state.playlists[index] = nextPlaylist;
    await this.saveSoundLibraryState(state);
    return nextPlaylist;
  }

  static async deleteSoundPlaylist(playlistId) {
    const state = this.getSoundLibraryState();
    state.playlists = state.playlists.filter((playlist) => playlist.id !== playlistId);
    await this.saveSoundLibraryState(state);
  }

  static getSceneSoundPlaylistIds(sceneId) {
    return this.getSoundPlaylists()
      .filter((playlist) => playlist.sceneIds.includes(String(sceneId || "").trim()))
      .map((playlist) => playlist.id);
  }

  static getSceneSoundPlaylists(sceneId) {
    const targetSceneId = String(sceneId || "").trim();
    return this.getSoundPlaylists().filter((playlist) => playlist.sceneIds.includes(targetSceneId));
  }

  static async setSceneSoundPlaylistAssignments(sceneId, playlistIds = []) {
    const targetSceneId = String(sceneId || "").trim();
    const normalizedPlaylistIds = new Set((Array.isArray(playlistIds) ? playlistIds : []).map((id) => String(id || "").trim()).filter(Boolean));
    const state = this.getSoundLibraryState();
    state.playlists = state.playlists.map((playlist) => {
      const sceneIds = new Set(Array.isArray(playlist.sceneIds) ? playlist.sceneIds : []);
      if (normalizedPlaylistIds.has(playlist.id)) sceneIds.add(targetSceneId);
      else sceneIds.delete(targetSceneId);
      return this._normalizeSoundPlaylist({
        ...playlist,
        sceneIds: Array.from(sceneIds)
      });
    });
    await this.saveSoundLibraryState(state);
    return this.getSceneSoundPlaylists(targetSceneId);
  }

  static _normalizeWorldMapPin(pinData = {}) {
    const type = String(pinData.type || "location").trim().toLowerCase();
    return {
      id: String(pinData.id || randomId()).trim() || randomId(),
      label: String(pinData.label || tr("Pin")).trim() || tr("Pin"),
      type: type || "location",
      x: Number.isFinite(Number(pinData.x)) ? Number(pinData.x) : 0,
      y: Number.isFinite(Number(pinData.y)) ? Number(pinData.y) : 0,
      note: String(pinData.note || "").trim(),
      icon: String(pinData.icon || "").trim(),
      documentUuid: String(pinData.documentUuid || "").trim(),
      documentType: String(pinData.documentType || "").trim(),
      documentName: String(pinData.documentName || "").trim(),
      color: /^#[0-9a-f]{6}$/i.test(String(pinData.color || "").trim()) ? String(pinData.color).trim().toLowerCase() : "#7ebaec",
      size: Number.isFinite(Number(pinData.size)) ? Math.max(0.7, Math.min(2.4, Number(pinData.size))) : 1,
      borderColor: /^#[0-9a-f]{6}$/i.test(String(pinData.borderColor || "").trim()) ? String(pinData.borderColor).trim().toLowerCase() : "#101722",
      borderWidth: Number.isFinite(Number(pinData.borderWidth)) ? Math.max(0, Math.min(8, Number(pinData.borderWidth))) : 0,
      shadowColor: /^#[0-9a-f]{6}$/i.test(String(pinData.shadowColor || "").trim()) ? String(pinData.shadowColor).trim().toLowerCase() : "#000000",
      shadowDistance: Number.isFinite(Number(pinData.shadowDistance)) ? Math.max(0, Math.min(32, Number(pinData.shadowDistance))) : 2,
      shadowOpacity: Number.isFinite(Number(pinData.shadowOpacity)) ? Math.max(0, Math.min(1, Number(pinData.shadowOpacity))) : 0.55,
      shadowBlur: Number.isFinite(Number(pinData.shadowBlur)) ? Math.max(0, Math.min(32, Number(pinData.shadowBlur))) : 4,
      movableForPlayers: Boolean(pinData.movableForPlayers)
    };
  }

  static _getDefaultWorldMapCategories() {
    return [
      { id: "settlement", name: tr("Settlement"), iconClass: "fa-house", color: "#2f4057" },
      { id: "location", name: tr("Location"), iconClass: "fa-location-dot", color: "#33475f" },
      { id: "poi", name: tr("Point of interest"), iconClass: "fa-star", color: "#39455c" },
      { id: "headquarters", name: tr("Headquarters"), iconClass: "fa-shield-halved", color: "#3c4259" }
    ];
  }

  static _normalizeWorldMapCategory(categoryData = {}) {
    const fallback = this._getDefaultWorldMapCategories()[0];
    const id = String(categoryData.id || categoryData.name || fallback.id).trim().toLowerCase().replace(/[^a-z0-9-_]+/g, "-");
    return {
      id: id || fallback.id,
      name: String(categoryData.name || fallback.name).trim() || fallback.name,
      iconClass: String(categoryData.iconClass || fallback.iconClass).trim() || fallback.iconClass,
      color: /^#[0-9a-f]{6}$/i.test(String(categoryData.color || "").trim()) ? String(categoryData.color).trim().toLowerCase() : fallback.color
    };
  }

  static _normalizeWorldMapOverlay(overlayData = {}) {
    const id = String(overlayData.id || randomId()).trim() || randomId();
    const name = String(overlayData.name || tr("Overlay")).trim() || tr("Overlay");
    const sourceImage = this._normalizePublicAssetPath(overlayData.sourceImage);
    const tileRootPath = this._normalizePublicAssetPath(overlayData.tileRootPath);
    const tileUrlTemplate = this._normalizePublicAssetPath(overlayData.tileUrlTemplate);
    const manifestPath = this._normalizePublicAssetPath(overlayData.manifestPath);
    const opacity = Number.isFinite(Number(overlayData.opacity))
      ? Math.max(0, Math.min(1, Number(overlayData.opacity)))
      : 1;
    return {
      id,
      name,
      sourceImage,
      tileRootPath,
      tileUrlTemplate,
      manifestPath,
      opacity,
      visibleByDefault: Boolean(overlayData.visibleByDefault),
      status: tileUrlTemplate ? "ready" : "draft"
    };
  }

  static _normalizeWorldMapFogSettings(fogData = {}) {
    const mode = String(fogData.mode || "color").trim().toLowerCase();
    const operations = Array.isArray(fogData.operations)
      ? fogData.operations
          .map((operation) => {
            const tool = String(operation?.tool || "brush").trim().toLowerCase();
            const action = String(operation?.action || "reveal").trim().toLowerCase();
            const points = Array.isArray(operation?.points)
              ? operation.points
                  .map((point) => ({
                    x: Number.isFinite(Number(point?.x)) ? Number(point.x) : null,
                    y: Number.isFinite(Number(point?.y)) ? Number(point.y) : null
                  }))
                  .filter((point) => point.x !== null && point.y !== null)
              : [];
            if (!["brush", "polygon"].includes(tool) || !["reveal", "restore"].includes(action) || !points.length) return null;
            return {
              id: String(operation?.id || randomId()).trim() || randomId(),
              tool,
              action,
              points,
              space: String(operation?.space || "map").trim().toLowerCase() === "screen" ? "screen" : "map",
              radius: Number.isFinite(Number(operation?.radius)) ? Math.max(1, Math.min(32768, Number(operation.radius))) : 64,
              feather: Number.isFinite(Number(operation?.feather)) ? Math.max(0, Math.min(32768, Number(operation.feather))) : 18,
              createdAt: Number.isFinite(Number(operation?.createdAt)) ? Number(operation.createdAt) : Date.now()
            };
          })
          .filter(Boolean)
      : [];
    return {
      enabled: Boolean(fogData.enabled),
      mode: ["color", "image"].includes(mode) ? mode : "color",
      color: /^#[0-9a-f]{6}$/i.test(String(fogData.color || "").trim()) ? String(fogData.color).trim().toLowerCase() : "#07111f",
      opacity: Number.isFinite(Number(fogData.opacity)) ? Math.max(0, Math.min(1, Number(fogData.opacity))) : 0.88,
      imagePath: this._normalizePublicAssetPath(fogData.imagePath),
      imageTileSize: Number.isFinite(Number(fogData.imageTileSize)) ? Math.max(16, Math.min(2048, Number(fogData.imageTileSize))) : 256,
      imageTileFixedOnZoom: Boolean(fogData.imageTileFixedOnZoom),
      imageTileViewportLocked: Boolean(fogData.imageTileViewportLocked),
      operations
    };
  }

  static _normalizeWorldMapObjectOverlay(objectData = {}) {
    const type = String(objectData.type || "image").trim().toLowerCase();
    const normalizedType = ["image", "text"].includes(type) ? type : "image";
    const nameFallback = normalizedType === "text" ? tr("Text object") : tr("Image object");
    const color = /^#[0-9a-f]{6}$/i.test(String(objectData.color || "").trim()) ? String(objectData.color).trim().toLowerCase() : "#f2f5f8";
    const category = String(objectData.category || tr("General")).trim() || tr("General");
    return {
      id: String(objectData.id || randomId()).trim() || randomId(),
      type: normalizedType,
      name: String(objectData.name || nameFallback).trim() || nameFallback,
      category,
      x: Number.isFinite(Number(objectData.x)) ? Number(objectData.x) : 0,
      y: Number.isFinite(Number(objectData.y)) ? Number(objectData.y) : 0,
      imagePath: this._normalizePublicAssetPath(objectData.imagePath),
      text: String(objectData.text || "").trim(),
      documentUuid: String(objectData.documentUuid || "").trim(),
      documentType: String(objectData.documentType || "").trim(),
      documentName: String(objectData.documentName || "").trim(),
      width: Number.isFinite(Number(objectData.width)) ? Math.max(16, Math.min(4096, Number(objectData.width))) : 160,
      fontSize: Number.isFinite(Number(objectData.fontSize)) ? Math.max(8, Math.min(256, Number(objectData.fontSize))) : 24,
      lineHeight: Number.isFinite(Number(objectData.lineHeight)) ? Math.max(0.6, Math.min(2.4, Number(objectData.lineHeight))) : 0.95,
      fontFamily: String(objectData.fontFamily || "").trim(),
      color,
      outlineColor: /^#[0-9a-f]{6}$/i.test(String(objectData.outlineColor || "").trim()) ? String(objectData.outlineColor).trim().toLowerCase() : "#101722",
      outlineMode: ["outer", "center"].includes(String(objectData.outlineMode || "").trim().toLowerCase())
        ? String(objectData.outlineMode).trim().toLowerCase()
        : "outer",
      outlineWidth: Number.isFinite(Number(objectData.outlineWidth)) ? Math.max(0, Math.min(12, Number(objectData.outlineWidth))) : 0,
      shadowColor: /^#[0-9a-f]{6}$/i.test(String(objectData.shadowColor || "").trim()) ? String(objectData.shadowColor).trim().toLowerCase() : "#000000",
      shadowDistance: Number.isFinite(Number(objectData.shadowDistance)) ? Math.max(0, Math.min(64, Number(objectData.shadowDistance))) : 2,
      shadowBlur: Number.isFinite(Number(objectData.shadowBlur)) ? Math.max(0, Math.min(64, Number(objectData.shadowBlur))) : 8,
      shadowHardness: Number.isFinite(Number(objectData.shadowHardness)) ? Math.max(0, Math.min(1, Number(objectData.shadowHardness))) : 0.35,
      shadowOpacity: Number.isFinite(Number(objectData.shadowOpacity)) ? Math.max(0, Math.min(1, Number(objectData.shadowOpacity))) : 0.7,
      opacity: Number.isFinite(Number(objectData.opacity)) ? Math.max(0, Math.min(1, Number(objectData.opacity))) : 1,
      scaleWithZoom: objectData.scaleWithZoom !== false,
      visible: objectData.visible !== false,
      movableForPlayers: Boolean(objectData.movableForPlayers)
    };
  }

  static _normalizeWorldMapRegion(regionData = {}) {
    const fillColor = /^#[0-9a-f]{6}$/i.test(String(regionData.fillColor || "").trim()) ? String(regionData.fillColor).trim().toLowerCase() : "#7ebaec";
    const strokeColor = /^#[0-9a-f]{6}$/i.test(String(regionData.strokeColor || "").trim()) ? String(regionData.strokeColor).trim().toLowerCase() : "#d7e8ff";
    const fillStyle = String(regionData.fillStyle || "solid").trim().toLowerCase();
    const strokeStyle = String(regionData.strokeStyle || "solid").trim().toLowerCase();
    const points = Array.isArray(regionData.points)
      ? regionData.points
          .map((point) => ({
            x: Number.isFinite(Number(point?.x)) ? Number(point.x) : null,
            y: Number.isFinite(Number(point?.y)) ? Number(point.y) : null
          }))
          .filter((point) => point.x !== null && point.y !== null)
      : [];
    return {
      id: String(regionData.id || randomId()).trim() || randomId(),
      name: String(regionData.name || tr("Region")).trim() || tr("Region"),
      category: String(regionData.category || "general").trim().toLowerCase() || "general",
      points,
      documentUuid: String(regionData.documentUuid || "").trim(),
      documentType: String(regionData.documentType || "").trim(),
      documentName: String(regionData.documentName || "").trim(),
      fillColor,
      strokeColor,
      fillOpacity: Number.isFinite(Number(regionData.fillOpacity)) ? Math.max(0, Math.min(1, Number(regionData.fillOpacity))) : 0.28,
      strokeOpacity: Number.isFinite(Number(regionData.strokeOpacity)) ? Math.max(0, Math.min(1, Number(regionData.strokeOpacity))) : 0.95,
      strokeWidth: Number.isFinite(Number(regionData.strokeWidth)) ? Math.max(1, Math.min(12, Number(regionData.strokeWidth))) : 2,
      fillStyle: ["solid", "hatch", "crosshatch", "dots"].includes(fillStyle) ? fillStyle : "solid",
      fillPatternScale: Number.isFinite(Number(regionData.fillPatternScale)) ? Math.max(4, Math.min(48, Number(regionData.fillPatternScale))) : 14,
      fillPatternSize: Number.isFinite(Number(regionData.fillPatternSize)) ? Math.max(1, Math.min(24, Number(regionData.fillPatternSize))) : 2,
      strokeStyle: ["solid", "dashed", "dotted", "dashdot"].includes(strokeStyle) ? strokeStyle : "solid",
      visible: regionData.visible !== false
    };
  }

  static _normalizeWorldMapLine(lineData = {}) {
    const points = Array.isArray(lineData.points)
      ? lineData.points
          .map((point) => ({
            x: Number.isFinite(Number(point?.x)) ? Number(point.x) : null,
            y: Number.isFinite(Number(point?.y)) ? Number(point.y) : null
          }))
          .filter((point) => point.x !== null && point.y !== null)
      : [];
    const pointStyle = String(lineData.pointStyle || "none").trim().toLowerCase();
    const lineCap = String(lineData.lineCap || "round").trim().toLowerCase();
    const lineStyle = String(lineData.lineStyle || "solid").trim().toLowerCase();
    return {
      id: String(lineData.id || randomId()).trim() || randomId(),
      name: String(lineData.name || tr("Line")).trim() || tr("Line"),
      category: String(lineData.category || "location").trim().toLowerCase() || "location",
      points,
      documentUuid: String(lineData.documentUuid || "").trim(),
      documentType: String(lineData.documentType || "").trim(),
      documentName: String(lineData.documentName || "").trim(),
      color: /^#[0-9a-f]{6}$/i.test(String(lineData.color || "").trim()) ? String(lineData.color).trim().toLowerCase() : "#d7e8ff",
      opacity: Number.isFinite(Number(lineData.opacity)) ? Math.max(0, Math.min(1, Number(lineData.opacity))) : 0.95,
      width: Number.isFinite(Number(lineData.width)) ? Math.max(1, Math.min(32, Number(lineData.width))) : 3,
      outlineColor: /^#[0-9a-f]{6}$/i.test(String(lineData.outlineColor || "").trim()) ? String(lineData.outlineColor).trim().toLowerCase() : "#101722",
      outlineWidth: Number.isFinite(Number(lineData.outlineWidth)) ? Math.max(0, Math.min(32, Number(lineData.outlineWidth))) : 0,
      shadowColor: /^#[0-9a-f]{6}$/i.test(String(lineData.shadowColor || "").trim()) ? String(lineData.shadowColor).trim().toLowerCase() : "#000000",
      shadowOpacity: Number.isFinite(Number(lineData.shadowOpacity)) ? Math.max(0, Math.min(1, Number(lineData.shadowOpacity))) : 0.35,
      shadowBlur: Number.isFinite(Number(lineData.shadowBlur)) ? Math.max(0, Math.min(48, Number(lineData.shadowBlur))) : 6,
      lineStyle: ["solid", "dashed", "dotted", "dashdot"].includes(lineStyle) ? lineStyle : "solid",
      lineCap: ["round", "butt", "square"].includes(lineCap) ? lineCap : "round",
      pointStyle: ["none", "circle", "square"].includes(pointStyle) ? pointStyle : "none",
      pointSize: Number.isFinite(Number(lineData.pointSize)) ? Math.max(2, Math.min(32, Number(lineData.pointSize))) : 7,
      pointColor: /^#[0-9a-f]{6}$/i.test(String(lineData.pointColor || "").trim()) ? String(lineData.pointColor).trim().toLowerCase() : "#d7e8ff",
      pointOpacity: Number.isFinite(Number(lineData.pointOpacity)) ? Math.max(0, Math.min(1, Number(lineData.pointOpacity))) : 0.95,
      pointOutlineColor: /^#[0-9a-f]{6}$/i.test(String(lineData.pointOutlineColor || "").trim()) ? String(lineData.pointOutlineColor).trim().toLowerCase() : "#101722",
      pointOutlineWidth: Number.isFinite(Number(lineData.pointOutlineWidth)) ? Math.max(0, Math.min(12, Number(lineData.pointOutlineWidth))) : 1,
      visible: lineData.visible !== false,
      movableForPlayers: Boolean(lineData.movableForPlayers)
    };
  }

  static _getDefaultWorldMapFullscreenSettings() {
    return {
      preserveAspect: true,
      uiHidden: true,
      sharedLeftSidebarVisible: false,
      sharedRightSidebarVisible: false,
      backdropBlurEnabled: true,
      backdropImage: "",
      backdropImageScale: 1,
      backdropImageRepeat: "repeat",
      backdropDarkness: 0.2
    };
  }

  static _getDefaultWorldMapStyling() {
    return {
      tooltip: {
        backgroundColor: "#0d1726",
        backgroundOpacity: 0.92,
        blurEnabled: true,
        headingFont: "",
        headingColor: "#f2f5f8",
        headingSize: 1,
        textFont: "",
        textColor: "#d3dce7",
        textSize: 0.82,
        infoFont: "",
        infoColor: "#aebdce",
        infoSize: 0.76
      },
      general: {
        legendFont: "",
        legendColor: "#f2f5f8",
        legendSize: 0.56,
        pinListHeadingFont: "",
        pinListHeadingColor: "#f2f5f8",
        pinListHeadingSize: 1.02,
        pinListTextFont: "",
        pinListTextColor: "#c6d2df",
        pinListTextSize: 0.82
      }
    };
  }

  static _normalizeWorldMapStyling(stylingData = {}) {
    const defaults = this._getDefaultWorldMapStyling();
    const normalizeFont = (value) => String(value || "").trim();
    const normalizeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "").trim())
      ? String(value).trim().toLowerCase()
      : fallback;
    const normalizeSize = (value, fallback, min = 0.5, max = 2.4) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      return Math.max(min, Math.min(max, numeric));
    };

    return {
      tooltip: {
        backgroundColor: normalizeColor(stylingData?.tooltip?.backgroundColor, defaults.tooltip.backgroundColor),
        backgroundOpacity: Number.isFinite(Number(stylingData?.tooltip?.backgroundOpacity))
          ? Math.max(0, Math.min(1, Number(stylingData.tooltip.backgroundOpacity)))
          : defaults.tooltip.backgroundOpacity,
        blurEnabled: stylingData?.tooltip?.blurEnabled !== false,
        headingFont: normalizeFont(stylingData?.tooltip?.headingFont),
        headingColor: normalizeColor(stylingData?.tooltip?.headingColor, defaults.tooltip.headingColor),
        headingSize: normalizeSize(stylingData?.tooltip?.headingSize, defaults.tooltip.headingSize),
        textFont: normalizeFont(stylingData?.tooltip?.textFont),
        textColor: normalizeColor(stylingData?.tooltip?.textColor, defaults.tooltip.textColor),
        textSize: normalizeSize(stylingData?.tooltip?.textSize, defaults.tooltip.textSize),
        infoFont: normalizeFont(stylingData?.tooltip?.infoFont),
        infoColor: normalizeColor(stylingData?.tooltip?.infoColor, defaults.tooltip.infoColor),
        infoSize: normalizeSize(stylingData?.tooltip?.infoSize, defaults.tooltip.infoSize)
      },
      general: {
        legendFont: normalizeFont(stylingData?.general?.legendFont),
        legendColor: normalizeColor(stylingData?.general?.legendColor, defaults.general.legendColor),
        legendSize: normalizeSize(stylingData?.general?.legendSize, defaults.general.legendSize, 0.45, 1.6),
        pinListHeadingFont: normalizeFont(stylingData?.general?.pinListHeadingFont),
        pinListHeadingColor: normalizeColor(stylingData?.general?.pinListHeadingColor, defaults.general.pinListHeadingColor),
        pinListHeadingSize: normalizeSize(stylingData?.general?.pinListHeadingSize, defaults.general.pinListHeadingSize),
        pinListTextFont: normalizeFont(stylingData?.general?.pinListTextFont),
        pinListTextColor: normalizeColor(stylingData?.general?.pinListTextColor, defaults.general.pinListTextColor),
        pinListTextSize: normalizeSize(stylingData?.general?.pinListTextSize, defaults.general.pinListTextSize)
      }
    };
  }

  static _normalizeWorldMapFullscreenSettings(settingsData = {}) {
    const defaults = this._getDefaultWorldMapFullscreenSettings();
    return {
      preserveAspect: settingsData?.preserveAspect !== false,
      uiHidden: settingsData?.uiHidden !== false,
      sharedLeftSidebarVisible: Boolean(settingsData?.sharedLeftSidebarVisible),
      sharedRightSidebarVisible: Boolean(settingsData?.sharedRightSidebarVisible),
      backdropBlurEnabled: settingsData?.backdropBlurEnabled !== false,
      backdropImage: this._normalizePublicAssetPath(settingsData?.backdropImage),
      backdropImageScale: Number.isFinite(Number(settingsData?.backdropImageScale))
        ? Math.max(0.1, Math.min(4, Number(settingsData.backdropImageScale)))
        : defaults.backdropImageScale,
      backdropImageRepeat: ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(String(settingsData?.backdropImageRepeat || "").trim())
        ? String(settingsData.backdropImageRepeat).trim()
        : defaults.backdropImageRepeat,
      backdropDarkness: Number.isFinite(Number(settingsData?.backdropDarkness))
        ? Math.max(0, Math.min(0.92, Number(settingsData.backdropDarkness)))
        : defaults.backdropDarkness
    };
  }

  static _normalizeWorldMap(worldMap = {}) {
    const id = String(worldMap.id || randomId()).trim() || randomId();
    const name = String(worldMap.name || tr("New World Map")).trim() || tr("New World Map");
    const description = String(worldMap.description || "").trim();
    const sourceImage = this._normalizePublicAssetPath(worldMap.sourceImage);
    const thumbnail = this._normalizePublicAssetPath(worldMap.thumbnail || sourceImage);
    const tileRootPath = this._normalizePublicAssetPath(worldMap.tileRootPath);
    const tileUrlTemplate = this._normalizePublicAssetPath(worldMap.tileUrlTemplate);
    const manifestPath = this._normalizePublicAssetPath(worldMap.manifestPath);
    const tileSize = Math.max(128, Math.min(1024, Number(worldMap.tileSize) || 256));
    const width = Math.max(tileSize, Number(worldMap.width) || tileSize * 4);
    const height = Math.max(tileSize, Number(worldMap.height) || tileSize * 4);
    const computedNativeZoom = Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / tileSize)));
    const maxNativeZoom = Number.isFinite(Number(worldMap.maxNativeZoom))
      ? Math.max(0, Math.min(24, Number(worldMap.maxNativeZoom)))
      : computedNativeZoom;
    const minZoom = Number.isFinite(Number(worldMap.minZoom))
      ? Math.max(-8, Math.min(Number(worldMap.minZoom), maxNativeZoom))
      : 0;
    const requestedMaxZoom = Number.isFinite(Number(worldMap.maxZoom))
      ? Number(worldMap.maxZoom)
      : maxNativeZoom + 2;
    const maxZoom = Math.max(maxNativeZoom, Math.max(minZoom, Math.min(24, requestedMaxZoom)));
    const zoomStep = Number.isFinite(Number(worldMap.zoomStep))
      ? Math.max(0.1, Math.min(2, Number(worldMap.zoomStep)))
      : 0.25;
    const initialZoomRaw = Number(worldMap?.initialView?.zoom);
    const initialZoom = Number.isFinite(initialZoomRaw)
      ? Math.max(minZoom, Math.min(maxZoom, initialZoomRaw))
      : Math.max(minZoom, Math.min(maxZoom, maxNativeZoom));
    const initialXRaw = Number(worldMap?.initialView?.x);
    const initialYRaw = Number(worldMap?.initialView?.y);
    const initialX = Number.isFinite(initialXRaw) ? Math.max(0, Math.min(width, initialXRaw)) : Math.round(width / 2);
    const initialY = Number.isFinite(initialYRaw) ? Math.max(0, Math.min(height, initialYRaw)) : Math.round(height / 2);
    const categorySource = Array.isArray(worldMap.categories) && worldMap.categories.length
      ? worldMap.categories
      : [
          ...(Array.isArray(worldMap.pinCategories) ? worldMap.pinCategories : []),
          ...(Array.isArray(worldMap.objectCategories) ? worldMap.objectCategories : []),
          ...(Array.isArray(worldMap.regionCategories) ? worldMap.regionCategories : [])
        ];
    const categories = Array.from(new Map(
      (categorySource.length ? categorySource : this._getDefaultWorldMapCategories())
        .map((entry) => this._normalizeWorldMapCategory(entry))
        .map((entry) => [entry.id, entry])
    ).values());
    const allowedCategories = new Set(categories.map((entry) => entry.id));
    const lockedCategoriesInput = worldMap.lockedCategories && typeof worldMap.lockedCategories === "object" ? worldMap.lockedCategories : {};
    const normalizeLockedCategories = (values, allowedValues) => Array.from(new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => value && allowedValues.has(value))
    ));
    const lockedCategories = {
      categories: normalizeLockedCategories([
        ...(Array.isArray(lockedCategoriesInput.categories) ? lockedCategoriesInput.categories : []),
        ...(Array.isArray(lockedCategoriesInput.pins) ? lockedCategoriesInput.pins : []),
        ...(Array.isArray(lockedCategoriesInput.objects) ? lockedCategoriesInput.objects : []),
        ...(Array.isArray(lockedCategoriesInput.regions) ? lockedCategoriesInput.regions : [])
      ], allowedCategories),
      pins: [],
      objects: [],
      regions: []
    };
    const defaultCategory = categories[0]?.id || "location";
    const pins = Array.isArray(worldMap.pins)
      ? Array.from(new Map(
          worldMap.pins
            .map((pin) => this._normalizeWorldMapPin(pin))
            .map((pin) => [pin.id, {
              ...pin,
              type: allowedCategories.has(pin.type) ? pin.type : defaultCategory,
              x: Math.max(0, Math.min(width, pin.x)),
              y: Math.max(0, Math.min(height, pin.y))
            }])
        ).values())
      : [];
    const overlays = Array.isArray(worldMap.overlays)
      ? Array.from(new Map(
          worldMap.overlays
            .map((overlay) => this._normalizeWorldMapOverlay(overlay))
            .filter((overlay) => overlay.name || overlay.sourceImage)
            .map((overlay) => [overlay.id, overlay])
        ).values())
      : [];
    const objectOverlays = Array.isArray(worldMap.objectOverlays)
      ? Array.from(new Map(
          worldMap.objectOverlays
            .map((entry) => this._normalizeWorldMapObjectOverlay(entry))
            .map((entry) => [entry.id, {
              ...entry,
              category: allowedCategories.has(String(entry.category || "").trim().toLowerCase())
                ? String(entry.category || "").trim().toLowerCase()
                : defaultCategory,
              x: Math.max(0, Math.min(width, entry.x)),
              y: Math.max(0, Math.min(height, entry.y))
            }])
        ).values())
      : [];
    const regions = Array.isArray(worldMap.regions)
      ? Array.from(new Map(
          worldMap.regions
            .map((entry) => this._normalizeWorldMapRegion(entry))
            .filter((entry) => entry.points.length >= 3)
            .map((entry) => [entry.id, {
              ...entry,
              category: allowedCategories.has(String(entry.category || "").trim().toLowerCase())
                ? String(entry.category || "").trim().toLowerCase()
                : defaultCategory,
              points: entry.points.map((point) => ({
                x: Math.max(0, Math.min(width, point.x)),
                y: Math.max(0, Math.min(height, point.y))
              }))
            }])
        ).values())
      : [];
    const lines = Array.isArray(worldMap.lines)
      ? Array.from(new Map(
          worldMap.lines
            .map((entry) => this._normalizeWorldMapLine(entry))
            .filter((entry) => entry.points.length >= 2)
            .map((entry) => [entry.id, {
              ...entry,
              category: allowedCategories.has(String(entry.category || "").trim().toLowerCase())
                ? String(entry.category || "").trim().toLowerCase()
                : defaultCategory,
              points: entry.points.map((point) => ({
                x: Math.max(0, Math.min(width, point.x)),
                y: Math.max(0, Math.min(height, point.y))
              }))
            }])
        ).values())
      : [];

    return {
      id,
      name,
      description,
      sourceImage,
      thumbnail,
      tileRootPath,
      tileUrlTemplate,
      manifestPath,
      width,
      height,
      tileSize,
      minZoom,
      maxZoom,
      zoomStep,
      maxNativeZoom,
      initialView: {
        x: initialX,
        y: initialY,
        zoom: initialZoom
      },
      categories,
      pinCategories: categories,
      objectCategories: categories,
      regionCategories: categories,
      lockedCategories,
      overlays,
      objectOverlays,
      regions,
      lines,
      fogSettings: this._normalizeWorldMapFogSettings(worldMap.fogSettings),
      styling: this._normalizeWorldMapStyling(worldMap.styling),
      fullscreenSettings: this._normalizeWorldMapFullscreenSettings(worldMap.fullscreenSettings),
      sidebarCollapsedDefault: Boolean(worldMap.sidebarCollapsedDefault),
      pinSidebarCollapsedDefault: Boolean(worldMap.pinSidebarCollapsedDefault),
      pins,
      status: tileUrlTemplate ? "ready" : "draft",
      updatedAt: Number.isFinite(Number(worldMap.updatedAt)) ? Number(worldMap.updatedAt) : Date.now()
    };
  }

  static _normalizeWorldMapLibraryState(state = {}) {
    const mapsInput = Array.isArray(state)
      ? state
      : (Array.isArray(state?.maps) ? state.maps : []);
    const maps = mapsInput.map((entry) => this._normalizeWorldMap(entry));
    const activeMapId = maps.some((entry) => entry.id === state?.activeMapId)
      ? state.activeMapId
      : (maps[0]?.id ?? null);
    return {
      maps,
      activeMapId
    };
  }

  static getWorldMapLibraryState() {
    return this._normalizeWorldMapLibraryState(game.settings.get(MODULE_ID, SETTINGS.MAP_LIBRARY) ?? {});
  }

  static async saveWorldMapLibraryState(state = {}) {
    return game.settings.set(MODULE_ID, SETTINGS.MAP_LIBRARY, this._normalizeWorldMapLibraryState(state));
  }

  static getWorldMaps() {
    return this.getWorldMapLibraryState().maps;
  }

  static getWorldMapById(mapId) {
    const normalizedMapId = String(mapId || "").trim();
    if (!normalizedMapId) return null;
    return this.getWorldMaps().find((entry) => entry.id === normalizedMapId) ?? null;
  }

  static getActiveWorldMap() {
    const state = this.getWorldMapLibraryState();
    return state.maps.find((entry) => entry.id === state.activeMapId) ?? state.maps[0] ?? null;
  }

  static async setActiveWorldMap(mapId) {
    const state = this.getWorldMapLibraryState();
    const normalizedMapId = String(mapId || "").trim();
    if (!state.maps.some((entry) => entry.id === normalizedMapId)) return null;
    state.activeMapId = normalizedMapId;
    await this.saveWorldMapLibraryState(state);
    return this.getWorldMapById(normalizedMapId);
  }

  static async upsertWorldMap(worldMapData = {}) {
    const state = this.getWorldMapLibraryState();
    const existingMap = worldMapData.id ? this.getWorldMapById(worldMapData.id) : null;
    const nextMap = this._normalizeWorldMap({
      ...duplicateData(existingMap ?? {}),
      ...worldMapData,
      id: worldMapData.id || existingMap?.id || randomId(),
      updatedAt: Date.now()
    });
    const index = state.maps.findIndex((entry) => entry.id === nextMap.id);
    if (index === -1) state.maps.push(nextMap);
    else state.maps[index] = nextMap;
    state.activeMapId = nextMap.id;
    await this.saveWorldMapLibraryState(state);
    return nextMap;
  }

  static async deleteWorldMap(mapId) {
    const normalizedMapId = String(mapId || "").trim();
    if (!normalizedMapId) return;
    const state = this.getWorldMapLibraryState();
    state.maps = state.maps.filter((entry) => entry.id !== normalizedMapId);
    if (!state.maps.length) state.activeMapId = null;
    else if (state.activeMapId === normalizedMapId) state.activeMapId = state.maps[0].id;
    await this.saveWorldMapLibraryState(state);
  }

  static async duplicateWorldMap(mapId) {
    const worldMap = this.getWorldMapById(mapId);
    if (!worldMap) return null;
    const duplicated = this._normalizeWorldMap({
      ...duplicateData(worldMap),
      id: randomId(),
      name: `${worldMap.name || tr("World Map")} ${tr("(Copy)")}`,
      overlays: Array.isArray(worldMap.overlays)
        ? worldMap.overlays.map((overlay) => ({ ...duplicateData(overlay), id: randomId() }))
        : [],
      objectOverlays: Array.isArray(worldMap.objectOverlays)
        ? worldMap.objectOverlays.map((entry) => ({ ...duplicateData(entry), id: randomId() }))
        : [],
      regions: Array.isArray(worldMap.regions)
        ? worldMap.regions.map((entry) => ({ ...duplicateData(entry), id: randomId() }))
        : [],
      lines: Array.isArray(worldMap.lines)
        ? worldMap.lines.map((entry) => ({ ...duplicateData(entry), id: randomId() }))
        : [],
      pins: Array.isArray(worldMap.pins)
        ? worldMap.pins.map((pin) => ({ ...duplicateData(pin), id: randomId() }))
        : [],
      updatedAt: Date.now()
    });
    await this.upsertWorldMap(duplicated);
    return duplicated;
  }

  static async upsertWorldMapPin(mapId, pinData = {}) {
    const worldMap = this.getWorldMapById(mapId);
    if (!worldMap) return null;
    const state = this.getWorldMapLibraryState();
    const mapIndex = state.maps.findIndex((entry) => entry.id === worldMap.id);
    if (mapIndex === -1) return null;
    const normalizedPin = this._normalizeWorldMapPin({
      ...(pinData.id ? state.maps[mapIndex].pins.find((entry) => entry.id === pinData.id) ?? {} : {}),
      ...pinData,
      id: pinData.id || randomId()
    });
    normalizedPin.x = Math.max(0, Math.min(worldMap.width, normalizedPin.x));
    normalizedPin.y = Math.max(0, Math.min(worldMap.height, normalizedPin.y));
    const pinIndex = state.maps[mapIndex].pins.findIndex((entry) => entry.id === normalizedPin.id);
    if (pinIndex === -1) state.maps[mapIndex].pins.push(normalizedPin);
    else state.maps[mapIndex].pins[pinIndex] = normalizedPin;
    state.maps[mapIndex].updatedAt = Date.now();
    await this.saveWorldMapLibraryState(state);
    return normalizedPin;
  }

  static async deleteWorldMapPin(mapId, pinId) {
    const normalizedMapId = String(mapId || "").trim();
    const normalizedPinId = String(pinId || "").trim();
    if (!normalizedMapId || !normalizedPinId) return;
    const state = this.getWorldMapLibraryState();
    const mapIndex = state.maps.findIndex((entry) => entry.id === normalizedMapId);
    if (mapIndex === -1) return;
    state.maps[mapIndex].pins = state.maps[mapIndex].pins.filter((entry) => entry.id !== normalizedPinId);
    state.maps[mapIndex].updatedAt = Date.now();
    await this.saveWorldMapLibraryState(state);
  }

  static async upsertWorldMapObjectOverlay(mapId, objectData = {}) {
    const worldMap = this.getWorldMapById(mapId);
    if (!worldMap) return null;
    const state = this.getWorldMapLibraryState();
    const mapIndex = state.maps.findIndex((entry) => entry.id === worldMap.id);
    if (mapIndex === -1) return null;
    const normalizedObject = this._normalizeWorldMapObjectOverlay({
      ...(objectData.id ? state.maps[mapIndex].objectOverlays?.find((entry) => entry.id === objectData.id) ?? {} : {}),
      ...objectData,
      id: objectData.id || randomId()
    });
    normalizedObject.x = Math.max(0, Math.min(worldMap.width, normalizedObject.x));
    normalizedObject.y = Math.max(0, Math.min(worldMap.height, normalizedObject.y));
    state.maps[mapIndex].objectOverlays = Array.isArray(state.maps[mapIndex].objectOverlays) ? state.maps[mapIndex].objectOverlays : [];
    const objectIndex = state.maps[mapIndex].objectOverlays.findIndex((entry) => entry.id === normalizedObject.id);
    if (objectIndex === -1) state.maps[mapIndex].objectOverlays.push(normalizedObject);
    else state.maps[mapIndex].objectOverlays[objectIndex] = normalizedObject;
    state.maps[mapIndex].updatedAt = Date.now();
    await this.saveWorldMapLibraryState(state);
    return normalizedObject;
  }

  static async deleteWorldMapObjectOverlay(mapId, objectId) {
    const normalizedMapId = String(mapId || "").trim();
    const normalizedObjectId = String(objectId || "").trim();
    if (!normalizedMapId || !normalizedObjectId) return;
    const state = this.getWorldMapLibraryState();
    const mapIndex = state.maps.findIndex((entry) => entry.id === normalizedMapId);
    if (mapIndex === -1) return;
    state.maps[mapIndex].objectOverlays = (state.maps[mapIndex].objectOverlays ?? []).filter((entry) => entry.id !== normalizedObjectId);
    state.maps[mapIndex].updatedAt = Date.now();
    await this.saveWorldMapLibraryState(state);
  }

  static async upsertWorldMapRegion(mapId, regionData = {}) {
    const worldMap = this.getWorldMapById(mapId);
    if (!worldMap) return null;
    const state = this.getWorldMapLibraryState();
    const mapIndex = state.maps.findIndex((entry) => entry.id === worldMap.id);
    if (mapIndex === -1) return null;
    const normalizedRegion = this._normalizeWorldMapRegion({
      ...(regionData.id ? state.maps[mapIndex].regions?.find((entry) => entry.id === regionData.id) ?? {} : {}),
      ...regionData,
      id: regionData.id || randomId()
    });
    normalizedRegion.points = normalizedRegion.points.map((point) => ({
      x: Math.max(0, Math.min(worldMap.width, point.x)),
      y: Math.max(0, Math.min(worldMap.height, point.y))
    }));
    state.maps[mapIndex].regions = Array.isArray(state.maps[mapIndex].regions) ? state.maps[mapIndex].regions : [];
    const regionIndex = state.maps[mapIndex].regions.findIndex((entry) => entry.id === normalizedRegion.id);
    if (regionIndex === -1) state.maps[mapIndex].regions.push(normalizedRegion);
    else state.maps[mapIndex].regions[regionIndex] = normalizedRegion;
    state.maps[mapIndex].updatedAt = Date.now();
    await this.saveWorldMapLibraryState(state);
    return normalizedRegion;
  }

  static async deleteWorldMapRegion(mapId, regionId) {
    const normalizedMapId = String(mapId || "").trim();
    const normalizedRegionId = String(regionId || "").trim();
    if (!normalizedMapId || !normalizedRegionId) return;
    const state = this.getWorldMapLibraryState();
    const mapIndex = state.maps.findIndex((entry) => entry.id === normalizedMapId);
    if (mapIndex === -1) return;
    state.maps[mapIndex].regions = (state.maps[mapIndex].regions ?? []).filter((entry) => entry.id !== normalizedRegionId);
    state.maps[mapIndex].updatedAt = Date.now();
    await this.saveWorldMapLibraryState(state);
  }

  static async upsertWorldMapLine(mapId, lineData = {}) {
    const worldMap = this.getWorldMapById(mapId);
    if (!worldMap) return null;
    const state = this.getWorldMapLibraryState();
    const mapIndex = state.maps.findIndex((entry) => entry.id === worldMap.id);
    if (mapIndex === -1) return null;
    const normalizedLine = this._normalizeWorldMapLine({
      ...(lineData.id ? state.maps[mapIndex].lines?.find((entry) => entry.id === lineData.id) ?? {} : {}),
      ...lineData,
      id: lineData.id || randomId()
    });
    normalizedLine.points = normalizedLine.points.map((point) => ({
      x: Math.max(0, Math.min(worldMap.width, point.x)),
      y: Math.max(0, Math.min(worldMap.height, point.y))
    }));
    state.maps[mapIndex].lines = Array.isArray(state.maps[mapIndex].lines) ? state.maps[mapIndex].lines : [];
    const lineIndex = state.maps[mapIndex].lines.findIndex((entry) => entry.id === normalizedLine.id);
    if (lineIndex === -1) state.maps[mapIndex].lines.push(normalizedLine);
    else state.maps[mapIndex].lines[lineIndex] = normalizedLine;
    state.maps[mapIndex].updatedAt = Date.now();
    await this.saveWorldMapLibraryState(state);
    return normalizedLine;
  }

  static async deleteWorldMapLine(mapId, lineId) {
    const normalizedMapId = String(mapId || "").trim();
    const normalizedLineId = String(lineId || "").trim();
    if (!normalizedMapId || !normalizedLineId) return;
    const state = this.getWorldMapLibraryState();
    const mapIndex = state.maps.findIndex((entry) => entry.id === normalizedMapId);
    if (mapIndex === -1) return;
    state.maps[mapIndex].lines = (state.maps[mapIndex].lines ?? []).filter((entry) => entry.id !== normalizedLineId);
    state.maps[mapIndex].updatedAt = Date.now();
    await this.saveWorldMapLibraryState(state);
  }

  static getMindmapState(plannerId = null) {
    const collection = this._normalizeAdventurePlannerCollection(game.settings.get(MODULE_ID, SETTINGS.MINDMAP) ?? {});
    const targetPlanner = (plannerId
      ? collection.planners.find((planner) => planner.id === plannerId)
      : null)
      ?? collection.planners.find((planner) => planner.id === collection.activePlannerId)
      ?? collection.planners[0]
      ?? null;
    return targetPlanner ?? this._normalizeAdventurePlanner();
  }

  static async saveMindmapState(state, plannerId = null) {
    const collection = this.getAdventurePlannerCollection();
    const targetPlannerId = state?.id || plannerId || collection.activePlannerId || collection.planners[0]?.id || randomId();
    const nextPlanner = this._normalizeAdventurePlanner({
      id: targetPlannerId,
      name: state?.name || this.getAdventurePlannerById(targetPlannerId)?.name || tr("Adventure Planner"),
      board: state?.board,
      nodeDesignPresets: state?.nodeDesignPresets ?? this.getAdventurePlannerById(targetPlannerId)?.nodeDesignPresets,
      nodes: state?.nodes,
      edges: state?.edges
    });

    const index = collection.planners.findIndex((planner) => planner.id === targetPlannerId);
    if (index === -1) collection.planners.push(nextPlanner);
    else collection.planners[index] = nextPlanner;

    collection.activePlannerId = targetPlannerId;
    return game.settings.set(MODULE_ID, SETTINGS.MINDMAP, collection);
  }

  static getAdventurePlannerCollection() {
    return this._normalizeAdventurePlannerCollection(game.settings.get(MODULE_ID, SETTINGS.MINDMAP) ?? {});
  }

  static getAdventurePlanners() {
    return this.getAdventurePlannerCollection().planners;
  }

  static getAdventurePlannerById(plannerId) {
    return this.getAdventurePlanners().find((planner) => planner.id === plannerId) ?? null;
  }

  static getActiveAdventurePlanner() {
    const collection = this.getAdventurePlannerCollection();
    return collection.planners.find((planner) => planner.id === collection.activePlannerId) ?? collection.planners[0] ?? null;
  }

  static async saveAdventurePlannerCollection(collection) {
    const nextCollection = this._normalizeAdventurePlannerCollection(collection);
    return game.settings.set(MODULE_ID, SETTINGS.MINDMAP, nextCollection);
  }

  static async setActiveAdventurePlanner(plannerId) {
    const collection = this.getAdventurePlannerCollection();
    if (!collection.planners.some((planner) => planner.id === plannerId)) return null;
    collection.activePlannerId = plannerId;
    await this.saveAdventurePlannerCollection(collection);
    return this.getAdventurePlannerById(plannerId);
  }

  static async upsertAdventurePlanner(plannerData) {
    const collection = this.getAdventurePlannerCollection();
    const nextPlanner = this._normalizeAdventurePlanner({
      id: plannerData.id || randomId(),
      name: plannerData.name || tr("New Adventure Planner"),
      board: plannerData.board,
      nodeDesignPresets: plannerData.nodeDesignPresets,
      nodes: plannerData.nodes,
      edges: plannerData.edges
    });

    const index = collection.planners.findIndex((planner) => planner.id === nextPlanner.id);
    if (index === -1) collection.planners.push(nextPlanner);
    else collection.planners[index] = nextPlanner;
    collection.activePlannerId = nextPlanner.id;

    await this.saveAdventurePlannerCollection(collection);
    return nextPlanner;
  }

  static async deleteAdventurePlanner(plannerId) {
    const collection = this.getAdventurePlannerCollection();
    collection.planners = collection.planners.filter((planner) => planner.id !== plannerId);
    if (!collection.planners.length) {
      collection.activePlannerId = null;
    } else if (collection.activePlannerId === plannerId) {
      collection.activePlannerId = collection.planners[0].id;
    }
    await this.saveAdventurePlannerCollection(collection);
  }

  static async duplicateAdventurePlanner(plannerId) {
    const planner = this.getAdventurePlannerById(plannerId);
    if (!planner) return null;

    const duplicatedPlanner = this._normalizeAdventurePlanner({
      ...duplicateData(planner),
      id: randomId(),
      name: `${planner.name || tr("Adventure Planner")} ${tr("(Copy)")}`,
      nodes: Array.isArray(planner.nodes)
        ? planner.nodes.map((node) => ({
            ...duplicateData(node),
            id: randomId()
          }))
        : [],
      edges: []
    });

    const nodeIdMap = new Map();
    duplicatedPlanner.nodes.forEach((node, index) => {
      nodeIdMap.set(planner.nodes[index].id, node.id);
    });

    duplicatedPlanner.edges = Array.isArray(planner.edges)
      ? planner.edges
          .map((edge) => ({
            ...duplicateData(edge),
            id: randomId(),
            fromNodeId: nodeIdMap.get(edge.fromNodeId),
            toNodeId: nodeIdMap.get(edge.toNodeId)
          }))
          .filter((edge) => edge.fromNodeId && edge.toNodeId)
      : [];

    await this.upsertAdventurePlanner(duplicatedPlanner);
    return duplicatedPlanner;
  }

  static async createMindmapNodeDesignPreset(plannerId, presetData = {}) {
    const planner = plannerId ? this.getAdventurePlannerById(plannerId) : this.getActiveAdventurePlanner();
    if (!planner) return null;
    const collection = this.getAdventurePlannerCollection();
    const plannerIndex = collection.planners.findIndex((entry) => entry.id === planner.id);
    if (plannerIndex === -1) return null;

    const currentPlanner = duplicateData(collection.planners[plannerIndex]);
    const presets = Array.isArray(currentPlanner.nodeDesignPresets) ? currentPlanner.nodeDesignPresets.slice(0, 10) : [];
    if (presets.length >= 10) return null;

    presets.push(this._normalizeMindmapNodeDesignPreset(presetData));
    currentPlanner.nodeDesignPresets = presets;
    collection.planners[plannerIndex] = this._normalizeAdventurePlanner(currentPlanner);
    await this.saveAdventurePlannerCollection(collection);
    return this.getAdventurePlannerById(planner.id)?.nodeDesignPresets?.at(-1) ?? null;
  }

  static async updateMindmapNodeDesignPreset(plannerId, presetId, patch = {}) {
    if (!presetId) return null;
    const planner = plannerId ? this.getAdventurePlannerById(plannerId) : this.getActiveAdventurePlanner();
    if (!planner) return null;
    const collection = this.getAdventurePlannerCollection();
    const plannerIndex = collection.planners.findIndex((entry) => entry.id === planner.id);
    if (plannerIndex === -1) return null;

    const currentPlanner = duplicateData(collection.planners[plannerIndex]);
    const presets = Array.isArray(currentPlanner.nodeDesignPresets) ? currentPlanner.nodeDesignPresets : [];
    const presetIndex = presets.findIndex((preset) => preset.id === presetId);
    if (presetIndex === -1) return null;

    presets[presetIndex] = this._normalizeMindmapNodeDesignPreset({
      ...presets[presetIndex],
      ...patch,
      id: presetId
    });
    currentPlanner.nodeDesignPresets = presets;
    collection.planners[plannerIndex] = this._normalizeAdventurePlanner(currentPlanner);
    await this.saveAdventurePlannerCollection(collection);
    return this.getAdventurePlannerById(planner.id)?.nodeDesignPresets?.find((preset) => preset.id === presetId) ?? null;
  }

  static async deleteMindmapNodeDesignPreset(plannerId, presetId) {
    if (!presetId) return;
    const planner = plannerId ? this.getAdventurePlannerById(plannerId) : this.getActiveAdventurePlanner();
    if (!planner) return;
    const collection = this.getAdventurePlannerCollection();
    const plannerIndex = collection.planners.findIndex((entry) => entry.id === planner.id);
    if (plannerIndex === -1) return;

    const currentPlanner = duplicateData(collection.planners[plannerIndex]);
    currentPlanner.nodeDesignPresets = (Array.isArray(currentPlanner.nodeDesignPresets) ? currentPlanner.nodeDesignPresets : [])
      .filter((preset) => preset.id !== presetId);
    collection.planners[plannerIndex] = this._normalizeAdventurePlanner(currentPlanner);
    await this.saveAdventurePlannerCollection(collection);
  }

  static async createMindmapNode(nodeData, plannerId = null) {
    const planner = plannerId ? this.getAdventurePlannerById(plannerId) : this.getActiveAdventurePlanner();
    const state = duplicateData(planner ?? this._normalizeAdventurePlanner({ id: plannerId || randomId() }));
    const node = this._normalizeMindmapNode(nodeData);

    state.nodes.push(node);
    await this.saveMindmapState(state);
    return node;
  }

  static async updateMindmapNode(nodeId, patch, plannerId = null) {
    const planner = plannerId ? this.getAdventurePlannerById(plannerId) : this.getActiveAdventurePlanner();
    const state = duplicateData(planner ?? this.getMindmapState());
    const index = state.nodes.findIndex((node) => node.id === nodeId);
    if (index === -1) return null;

    state.nodes[index] = {
      ...state.nodes[index],
      ...patch
    };

    await this.saveMindmapState(state);
    return state.nodes[index];
  }

  static async deleteMindmapNode(nodeId, plannerId = null) {
    const planner = plannerId ? this.getAdventurePlannerById(plannerId) : this.getActiveAdventurePlanner();
    const state = duplicateData(planner ?? this.getMindmapState());
    state.nodes = state.nodes.filter((node) => node.id !== nodeId);
    state.edges = state.edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId);
    await this.saveMindmapState(state);
    await this.removeStageGoblinPlannerNodeItems(planner?.id || plannerId || state.id, nodeId);
  }

  static async createMindmapEdge(fromNodeId, toNodeId, fromSide = "right", toSide = "left", plannerId = null, style = "solid", color = "rgba(110, 39, 48, 0.92)", colorAlpha = 0.92) {
    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return null;

    const planner = plannerId ? this.getAdventurePlannerById(plannerId) : this.getActiveAdventurePlanner();
    const state = duplicateData(planner ?? this.getMindmapState());
    const existing = state.edges.find((edge) =>
      (edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId)
      || (edge.fromNodeId === toNodeId && edge.toNodeId === fromNodeId)
    );
    if (existing) return existing;

    const edge = {
      id: randomId(),
      fromNodeId,
      toNodeId,
      fromSide,
      toSide,
      style: ["solid", "dashed", "dotted"].includes(style) ? style : "solid",
      color,
      colorAlpha: Math.max(0.01, Math.min(1, Number(colorAlpha) || 0.92))
    };

    state.edges.push(edge);
    await this.saveMindmapState(state);
    return edge;
  }

  static async deleteMindmapEdge(edgeId, plannerId = null) {
    const planner = plannerId ? this.getAdventurePlannerById(plannerId) : this.getActiveAdventurePlanner();
    const state = duplicateData(planner ?? this.getMindmapState());
    state.edges = state.edges.filter((edge) => edge.id !== edgeId);
    await this.saveMindmapState(state);
  }

  static getRuntimeState() {
    return normalizeRuntimeState(game.settings.get(MODULE_ID, SETTINGS.RUNTIME));
  }

  static async saveRuntimeState(runtimeState) {
    return game.settings.set(MODULE_ID, SETTINGS.RUNTIME, normalizeRuntimeState(runtimeState));
  }

  static getStageGoblinState() {
    return this._normalizeStageGoblinState(game.settings.get(MODULE_ID, SETTINGS.STAGE_GOBLIN));
  }

  static async saveStageGoblinState(state) {
    return game.settings.set(MODULE_ID, SETTINGS.STAGE_GOBLIN, this._normalizeStageGoblinState(state));
  }

  static async saveStageGoblinPosition(position = {}) {
    const state = this.getStageGoblinState();
    state.position = {
      left: Math.max(0, Number(position.left) || state.position.left),
      top: Math.max(0, Number(position.top) || state.position.top),
      width: Math.max(240, Number(position.width) || state.position.width),
      height: Math.max(44, Number(position.height) || state.position.height)
    };
    await this.saveStageGoblinState(state);
    return state.position;
  }

  static async saveStageGoblinSelectedPlanner(plannerId = null) {
    const state = this.getStageGoblinState();
    const normalizedPlannerId = String(plannerId || "").trim();
    state.selectedPlannerId = this.getAdventurePlanners().some((planner) => planner.id === normalizedPlannerId)
      ? normalizedPlannerId
      : null;
    await this.saveStageGoblinState(state);
    return state.selectedPlannerId;
  }

  static async saveStageGoblinCollapsed(collapsed = false) {
    const state = this.getStageGoblinState();
    state.collapsed = Boolean(collapsed);
    await this.saveStageGoblinState(state);
    return state.collapsed;
  }

  static async addStageGoblinItem(itemData = {}) {
    const state = this.getStageGoblinState();
    const nextItem = this._normalizeStageGoblinItem(itemData);
    const duplicateIndex = state.items.findIndex((item) => (
      nextItem.sourceType === "plannerNode"
        ? item.sourceType === "plannerNode" && item.plannerId === nextItem.plannerId && item.nodeId === nextItem.nodeId
        : item.sourceType === "document"
          && (
            (nextItem.documentUuid && item.documentUuid === nextItem.documentUuid)
            || (!nextItem.documentUuid && item.documentType === nextItem.documentType && item.documentId === nextItem.documentId)
          )
    ));

    if (duplicateIndex !== -1) {
      return state.items[duplicateIndex];
    }

    state.items.push(nextItem);
    await this.saveStageGoblinState(state);
    return nextItem;
  }

  static async removeStageGoblinItem(itemId) {
    const state = this.getStageGoblinState();
    state.items = state.items.filter((item) => item.id !== itemId);
    await this.saveStageGoblinState(state);
  }

  static async toggleStageGoblinPlannerNode(plannerId, nodeId, label = "Entry") {
    const state = this.getStageGoblinState();
    const existing = state.items.find((item) => item.sourceType === "plannerNode" && item.plannerId === plannerId && item.nodeId === nodeId);
    if (existing) {
      state.items = state.items.filter((item) => item.id !== existing.id);
      await this.saveStageGoblinState(state);
      return false;
    }

    state.items.push(this._normalizeStageGoblinItem({
      sourceType: "plannerNode",
      plannerId,
      nodeId,
      label
    }));
    await this.saveStageGoblinState(state);
    return true;
  }

  static async reorderStageGoblinItems(draggedItemId, targetItemId) {
    if (!draggedItemId || !targetItemId || draggedItemId === targetItemId) return;
    const state = this.getStageGoblinState();
    const draggedIndex = state.items.findIndex((item) => item.id === draggedItemId);
    const targetIndex = state.items.findIndex((item) => item.id === targetItemId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedItem] = state.items.splice(draggedIndex, 1);
    const nextTargetIndex = state.items.findIndex((item) => item.id === targetItemId);
    state.items.splice(nextTargetIndex === -1 ? state.items.length : nextTargetIndex, 0, draggedItem);
    await this.saveStageGoblinState(state);
  }

  static async reorderStageGoblinItemToIndex(draggedItemId, targetIndex) {
    if (!draggedItemId || !Number.isFinite(targetIndex)) return;
    const state = this.getStageGoblinState();
    const draggedIndex = state.items.findIndex((item) => item.id === draggedItemId);
    if (draggedIndex === -1) return;

    const [draggedItem] = state.items.splice(draggedIndex, 1);
    const clampedIndex = Math.max(0, Math.min(Number(targetIndex), state.items.length));
    state.items.splice(clampedIndex, 0, draggedItem);
    await this.saveStageGoblinState(state);
  }

  static async removeStageGoblinPlannerNodeItems(plannerId, nodeId) {
    if (!plannerId || !nodeId) return;
    const state = this.getStageGoblinState();
    const nextItems = state.items.filter((item) => !(item.sourceType === "plannerNode" && item.plannerId === plannerId && item.nodeId === nodeId));
    if (nextItems.length === state.items.length) return;
    state.items = nextItems;
    await this.saveStageGoblinState(state);
  }
}
