export const MODULE_ID = "footlights";

export const SETTINGS = {
  LANGUAGE: "language",
  PROFILES: "actorProfiles",
  SCENES: "theatreScenes",
  AVATARS: "theatreAvatars",
  AVATAR_TOKEN_BAKE_SIZE: "avatarTokenBakeSize",
  AVATAR_LIBRARY: "avatarLibraryState",
  SOUND_LIBRARY: "soundLibraryState",
  MAP_LIBRARY: "worldMapLibraryState",
  PORTAL_LIBRARY: "portalLibraryState",
  MOODS: "moodPresets",
  THEME: "themeState",
  THEME_PRESETS: "themePresets",
  MINDMAP: "mindmapState",
  STAGE_GOBLIN: "stageGoblinState",
  GLOBAL_SOUND_PLAYER: "globalSoundPlayerState",
  DIALOG_LAYOUT: "dialogLayoutState",
  WORLD_MAP_VIEW: "worldMapViewState",
  RUNTIME: "runtimeState"
};

export const SCENE_TRANSITION_EFFECTS = [
  { value: "none", label: "Kein Effect", description: "Scene wird ohne besondere Uebergangsanimation gewechselt." },
  { value: "blurZoom", label: "Blur + Zoom", description: "New Scene kommt mit Film-Blur und leichtem Zoom in den Fokus." },
  { value: "glitch", label: "Glitch", description: "Digitaler Signalwechsel mit kurzen Jittern und Bloom." },
  { value: "scanlineBoot", label: "Scanlines", description: "Monitor-like line structure with gentle scanlines during scene transitions." }
];

export const DEFAULT_RUNTIME_STATE = {
  activeSceneId: null,
  highlightedSceneActorIds: [],
  sceneActorMoods: {},
  sceneActorTransforms: {},
  backgroundDim: 0,
  sceneAudio: {
    sceneId: null,
    trackId: null,
    src: "",
    label: "",
    volume: 0.7,
    loop: false,
    playbackState: "stopped",
    position: 0
  },
  soundboardTrigger: {
    id: null,
    sceneId: null,
    src: "",
    label: "",
    volume: 1
  },
  forcedWorldMapOpen: {
    id: null,
    mapId: null,
    mode: "window",
    createdAt: 0
  },
  sharedLeftSidebarVisible: false,
  sharedRightSidebarVisible: false
};

export const DEFAULT_AVATAR_LIBRARY_STATE = {
  tokenDefaults: {
    frameImage: "",
    useCircularCrop: false
  }
};

export const DEFAULT_SOUND_LIBRARY_STATE = {
  playlists: []
};

export const DEFAULT_WORLD_MAP_LIBRARY_STATE = {
  maps: [],
  activeMapId: null
};

export const DEFAULT_PORTAL_LIBRARY_STATE = {
  portals: [],
  activePortalId: null
};

export const DEFAULT_MINDMAP_STATE = {
  planners: [],
  activePlannerId: null
};

export const DEFAULT_STAGE_GOBLIN_STATE = {
  barCount: 1,
  showLabels: true,
  position: {
    left: 96,
    top: 84,
    width: 720,
    height: 64
  },
  collapsed: false,
  selectedPlannerId: null,
  bars: [
    {
      id: "bar-1",
      label: "Stage Goblin Leiste 1",
      tagColor: "#8db4db",
      tagTextColor: "#0d1722",
      textColor: "",
      textAlpha: 1,
      iconSize: 0.92,
      tagPosition: "left",
      orientation: "horizontal",
      verticalItemHeight: 38,
      position: {
        left: 96,
        top: 84,
        width: 720,
        height: 64
      },
      collapsed: false,
      selectedPlannerId: null
    }
  ],
  items: []
};

export const DEFAULT_GLOBAL_SOUND_PLAYER_STATE = {
  position: {
    left: 128,
    top: 136,
    width: 640
  }
};

export const DEFAULT_THEME_STATE = {
  "typography": {
    "heading1": 1.46,
    "heading2": 1.18,
    "heading2Hover": 1.18,
    "heading3": 1.02,
    "body": 0.94,
    "subText": 0.82,
    "subTextHover": 0.82,
    "microText": 0.72,
    "labelText": 0.82,
    "navigationSize": 0.76,
    "heading1Font": "",
    "heading2Font": "",
    "heading3Font": "",
    "bodyFont": "",
    "subTextFont": "",
    "microTextFont": "",
    "labelTextFont": "",
    "navigationFont": ""
  },
  "navigation": {
    "surfaceStart": {
      "color": "#1a2430",
      "alpha": 0.96
    },
    "surfaceEnd": {
      "color": "#18202a",
      "alpha": 0.96
    },
    "cardStart": {
      "color": "#243142",
      "alpha": 0.94
    },
    "cardEnd": {
      "color": "#171f2b",
      "alpha": 0.94
    },
    "titleBarStart": {
      "color": "#151e29",
      "alpha": 0.98
    },
    "titleBarEnd": {
      "color": "#121922",
      "alpha": 0.98
    },
    "border1": {
      "color": "#7a93ad",
      "alpha": 0.22
    },
    "border2": {
      "color": "#7a93ad",
      "alpha": 0.14
    },
    "buttonStart": {
      "color": "#2b394a",
      "alpha": 0.96
    },
    "buttonEnd": {
      "color": "#1c2633",
      "alpha": 0.96
    },
    "buttonBorder": {
      "color": "#7a93ad",
      "alpha": 0.18
    },
    "buttonHoverStart": {
      "color": "#2f4156",
      "alpha": 0.98
    },
    "buttonHoverEnd": {
      "color": "#243141",
      "alpha": 0.98
    },
    "buttonHoverBorder": {
      "color": "#283e52",
      "alpha": 1
    },
    "buttonActiveStart": {
      "color": "#b8bf88",
      "alpha": 0.96
    },
    "buttonActiveEnd": {
      "color": "#9b9b7d",
      "alpha": 0.96
    },
    "buttonActiveBorder": {
      "color": "#1c3145",
      "alpha": 1
    },
    "divider": {
      "color": "#80b5e8",
      "alpha": 0.22
    },
    "shellDivider": {
      "color": "#1d262f",
      "alpha": 1
    },
    "actionSafeBg": {
      "color": "#8ea857",
      "alpha": 0.92
    },
    "actionSafeBorder": {
      "color": "#213445",
      "alpha": 1
    },
    "actionSafeIcon": {
      "color": "#243b51",
      "alpha": 0.98
    },
    "actionCreateBg": {
      "color": "#b7bc71",
      "alpha": 0.92
    },
    "actionCreateBorder": {
      "color": "#7a93ad",
      "alpha": 0.18
    },
    "actionCreateText": {
      "color": "#142839",
      "alpha": 1
    },
    "actionCreateHoverBg": {
      "color": "#9fa583",
      "alpha": 0.96
    },
    "actionCreateHoverText": {
      "color": "#d8ecff",
      "alpha": 0.96
    },
    "actionSettingsBg": {
      "color": "#334f6b",
      "alpha": 0.92
    },
    "actionSettingsBorder": {
      "color": "#22303f",
      "alpha": 1
    },
    "actionSettingsIcon": {
      "color": "#edf3f8",
      "alpha": 1
    },
    "text": {
      "color": "#edf3f8",
      "alpha": 1
    },
    "mutedText": {
      "color": "#b7c5d3",
      "alpha": 0.82
    },
    "headerRule": {
      "color": "#7d94ac",
      "alpha": 0.74
    },
    "icon": {
      "color": "#d9e4ee",
      "alpha": 0.96
    },
    "iconHover": {
      "color": "#f6fbff",
      "alpha": 0.98
    },
    "iconActive": {
      "color": "#18212c",
      "alpha": 0.96
    },
    "surfaceImage": "",
    "surfaceImageAlpha": 0,
    "surfaceImageScale": 1,
    "surfaceImageRepeat": "repeat",
    "cardImage": "",
    "cardImageAlpha": 0,
    "cardImageScale": 1,
    "cardImageRepeat": "repeat",
    "cardRadius": 20,
    "cardBlurEnabled": false,
    "border1Width": 1,
    "border2Width": 1,
    "buttonBorderWidth": 1,
    "buttonHoverBorderWidth": 1,
    "buttonActiveBorderWidth": 1,
    "tabRadius": 6,
    "actionSafeBorderWidth": 1,
    "actionSafeRadius": 4,
    "actionSafeIconSize": 1,
    "actionSettingsBorderWidth": 1,
    "actionSettingsRadius": 4,
    "actionSettingsIconSize": 1,
    "actionCreateBorderWidth": 1,
    "actionCreateRadius": 8
  },
  "content": {
    "appBackground": {
      "color": "#0f151d",
      "alpha": 1
    },
    "surfaceStart": {
      "color": "#18222d",
      "alpha": 1
    },
    "surfaceEnd": {
      "color": "#111922",
      "alpha": 0.96
    },
    "container": {
      "color": "#212d3a",
      "alpha": 0.8
    },
    "card": {
      "color": "#233448",
      "alpha": 0.32
    },
    "cardHover": {
      "color": "#253546",
      "alpha": 0.84
    },
    "formBackground": {
      "color": "#151d27",
      "alpha": 0.9
    },
    "divider": {
      "color": "#7289a1",
      "alpha": 0.14
    },
    "highlight": {
      "color": "#c0c78a",
      "alpha": 0.82
    },
    "scrollbar": {
      "color": "#7289a1",
      "alpha": 0.4
    },
    "shadow": {
      "color": "#030b18",
      "alpha": 0.34
    },
    "focusShadow": {
      "color": "#f0e493",
      "alpha": 0.12
    },
    "heading": {
      "color": "#bacc8a",
      "alpha": 1
    },
    "subheading": {
      "color": "#989c77",
      "alpha": 1
    },
    "buttonHoverHeading": {
      "color": "#ffffff",
      "alpha": 1
    },
    "label": {
      "color": "#d7e0e8",
      "alpha": 1
    },
    "text": {
      "color": "#e7edf3",
      "alpha": 1
    },
    "mutedText": {
      "color": "#b2bfcb",
      "alpha": 0.84
    },
    "buttonHoverSubText": {
      "color": "#eff5fb",
      "alpha": 0.95
    },
    "headerRule": {
      "color": "#7d94ac",
      "alpha": 0.72
    },
    "horizontal2": {
      "color": "#7d94ac",
      "alpha": 0.72
    },
    "border1": {
      "color": "#2c333a",
      "alpha": 0.31
    },
    "border2": {
      "color": "#232b34",
      "alpha": 1
    },
    "border3": {
      "color": "#7a93ad",
      "alpha": 0.1
    },
    "actionEditBg": {
      "color": "#314253",
      "alpha": 0.92
    },
    "actionEditIcon": {
      "color": "#edf4fb",
      "alpha": 0.96
    },
    "actionDuplicateBg": {
      "color": "#3b4861",
      "alpha": 0.92
    },
    "actionDuplicateIcon": {
      "color": "#e8eef8",
      "alpha": 0.96
    },
    "actionPlayBg": {
      "color": "#536f4b",
      "alpha": 0.5
    },
    "actionPlayIcon": {
      "color": "#ebffcb",
      "alpha": 0.98
    },
    "actionDeleteBg": {
      "color": "#5d3a40",
      "alpha": 0.42
    },
    "actionDeleteIcon": {
      "color": "#ffd8de",
      "alpha": 0.98
    },
    "actionSidebarBg": {
      "color": "#2e4053",
      "alpha": 0.92
    },
    "actionSidebarIcon": {
      "color": "#e3eef8",
      "alpha": 0.96
    },
    "actionGenericBg": {
      "color": "#2b3745",
      "alpha": 1
    },
    "actionGenericText": {
      "color": "#f1f6fb",
      "alpha": 1
    },
    "actionGenericBorder": {
      "color": "#7a93ad",
      "alpha": 0.18
    },
    "appBackgroundImage": "modules/footlights/assets/ui/fl_bgblur.webp",
    "appBackgroundImageAlpha": 0.06,
    "appBackgroundImageScale": 1.97,
    "appBackgroundImageRepeat": "repeat",
    "appBackgroundImageBlur": 3,
    "surfaceImage": "",
    "surfaceImageAlpha": 0,
    "surfaceImageScale": 3.71,
    "surfaceImageRepeat": "repeat",
    "surfaceImageBlur": 0,
    "containerImage": "",
    "containerImageAlpha": 0,
    "containerImageScale": 1,
    "containerImageRepeat": "repeat",
    "cardImage": "",
    "cardImageAlpha": 0,
    "cardImageScale": 1,
    "cardImageRepeat": "repeat",
    "surfaceRadius": 7,
    "containerRadius": 7,
    "cardRadius": 5,
    "cardHoverRadius": 4,
    "formRadius": 4,
    "border1Width": 1,
    "border2Width": 1,
    "border3Width": 1,
    "shadowBlur": 42,
    "shadowDistance": 18,
    "focusShadowBlur": 5,
    "focusShadowDistance": 2,
    "actionGenericBorderWidth": 1,
    "actionGenericRadius": 3,
    "actionEditIconSize": 1,
    "actionDuplicateIconSize": 1,
    "actionPlayIconSize": 1,
    "actionDeleteIconSize": 1,
    "actionSidebarIconSize": 1
  },
  "planner": {
    "heading": {
      "color": "#f1f6fb",
      "alpha": 1
    },
    "text": {
      "color": "#bcc9d6",
      "alpha": 0.92
    },
    "handle": {
      "color": "#9cb0c3",
      "alpha": 0.92
    },
    "actionIcon": {
      "color": "#ebffcb",
      "alpha": 0.98
    },
    "invertedHeading": {
      "color": "#081019",
      "alpha": 0.96
    },
    "invertedText": {
      "color": "#0d1722",
      "alpha": 0.92
    },
    "invertedHandle": {
      "color": "#0d1722",
      "alpha": 0.82
    },
    "invertedActionIcon": {
      "color": "#0d1722",
      "alpha": 0.96
    },
    "canvasStart": {
      "color": "#121a24",
      "alpha": 0.84
    },
    "canvasEnd": {
      "color": "#0d131b",
      "alpha": 0.82
    },
    "gridPrimary": {
      "color": "#7289a1",
      "alpha": 0.16
    },
    "gridSecondary": {
      "color": "#eef4fa",
      "alpha": 0.025
    },
    "toggleBg": {
      "color": "#2d3c4d",
      "alpha": 0.94
    },
    "toggleIcon": {
      "color": "#eef4fa",
      "alpha": 0.98
    },
    "backdrop": {
      "color": "#040a12",
      "alpha": 0.82
    },
    "backdropText": {
      "color": "#ffffff",
      "alpha": 0.34
    },
    "separator": {
      "color": "#7289a1",
      "alpha": 0.18
    }
  },
  "stageGoblin": {
    "surface": {
      "color": "#151d27",
      "alpha": 0.84
    },
    "border": {
      "color": "#7a93ad",
      "alpha": 0.18
    },
    "icon": {
      "color": "#dce7f0",
      "alpha": 0.96
    },
    "text": {
      "color": "#e7edf3",
      "alpha": 1
    },
    "iconSize": 0.92,
    "borderWidth": 1,
    "radius": 11,
    "tagFontSize": 0.62,
    "tagHeight": 26,
    "tagWidth": 92,
    "tagRadius": 4,
    "tagPaddingX": 0.42,
    "tagGlowEnabled": true,
    "tagGlowBlur": 14,
    "fontPreset": "subText"
  },
  "theatre": {
    "stageTitle": {
      "color": "#f1f6fb",
      "alpha": 1
    },
    "stageSubtitle": {
      "color": "#b2c2d1",
      "alpha": 0.96
    },
    "avatarName": {
      "color": "#edf4fb",
      "alpha": 0.98
    },
    "mood": {
      "color": "#ffffff",
      "alpha": 1
    },
    "titleBackground": {
      "color": "#18212d",
      "alpha": 0.9
    },
    "titleBackgroundBorder": {
      "color": "#7ebaec",
      "alpha": 0
    },
    "avatarNameBackground": {
      "color": "#1f2b38",
      "alpha": 0.92
    },
    "moodBackground": {
      "color": "#1f2b38",
      "alpha": 0.92
    },
    "gmBarBackground": {
      "color": "#1f2b38",
      "alpha": 0.92
    },
    "container1": {
      "color": "#1f2b38",
      "alpha": 0.92
    },
    "container1Border": {
      "color": "#7a93ad",
      "alpha": 0.18
    },
    "container2": {
      "color": "#283646",
      "alpha": 0.86
    },
    "container2Border": {
      "color": "#7a93ad",
      "alpha": 0.14
    },
    "container3": {
      "color": "#344252",
      "alpha": 0.9
    },
    "container3Border": {
      "color": "#7a93ad",
      "alpha": 0.16
    },
    "iconBackground": {
      "color": "#324253",
      "alpha": 0.92
    },
    "iconBorder": {
      "color": "#7a93ad",
      "alpha": 0.16
    },
    "iconColor": {
      "color": "#eef4fa",
      "alpha": 0.98
    },
    "stageFrame": {
      "color": "#7a93ad",
      "alpha": 0.18
    },
    "titleBackgroundBorderWidth": 0,
    "titleBackgroundRadius": 100,
    "gmBarImage": "",
    "gmBarImageAlpha": 0,
    "gmBarImageScale": 1,
    "gmBarImageRepeat": "repeat",
    "gmBarRadius": 18,
    "container1BorderWidth": 1,
    "container1Radius": 18,
    "container1BlurEnabled": true,
    "container2BorderWidth": 1,
    "container2Radius": 16,
    "container2BlurEnabled": true,
    "container3BorderWidth": 1,
    "container3Radius": 14,
    "container3BlurEnabled": false,
    "iconBorderWidth": 1,
    "stageTitleSize": 1.42,
    "stageTitleFont": "",
    "stageSubtitleSize": 0.94,
    "stageSubtitleFont": "",
    "avatarNameSize": 1.02,
    "moodSize": 1.02,
    "stageFrameWidth": 1,
    "stageFrameRadius": 24
  }
};

export const BUILTIN_THEME_PRESETS = [
  {
    "id": "builtin-footlights",
    "name": "Footlights",
    "theme": {
      "typography": {
        "heading1": 1.46,
        "heading2": 1.18,
        "heading2Hover": 1.18,
        "heading3": 1.02,
        "body": 0.94,
        "subText": 0.82,
        "subTextHover": 0.82,
        "microText": 0.72,
        "labelText": 0.82,
        "navigationSize": 0.76,
        "heading1Font": "",
        "heading2Font": "",
        "heading3Font": "",
        "bodyFont": "",
        "subTextFont": "",
        "microTextFont": "",
        "labelTextFont": "",
        "navigationFont": ""
      },
      "navigation": {
        "surfaceStart": {
          "color": "#1a2430",
          "alpha": 0.96
        },
        "surfaceEnd": {
          "color": "#18202a",
          "alpha": 0.96
        },
        "cardStart": {
          "color": "#243142",
          "alpha": 0.94
        },
        "cardEnd": {
          "color": "#171f2b",
          "alpha": 0.94
        },
        "titleBarStart": {
          "color": "#151e29",
          "alpha": 0.98
        },
        "titleBarEnd": {
          "color": "#121922",
          "alpha": 0.98
        },
        "border1": {
          "color": "#7a93ad",
          "alpha": 0.22
        },
        "border2": {
          "color": "#7a93ad",
          "alpha": 0.14
        },
        "buttonStart": {
          "color": "#2b394a",
          "alpha": 0.96
        },
        "buttonEnd": {
          "color": "#1c2633",
          "alpha": 0.96
        },
        "buttonBorder": {
          "color": "#7a93ad",
          "alpha": 0.18
        },
        "buttonHoverStart": {
          "color": "#2f4156",
          "alpha": 0.98
        },
        "buttonHoverEnd": {
          "color": "#243141",
          "alpha": 0.98
        },
        "buttonHoverBorder": {
          "color": "#283e52",
          "alpha": 1
        },
        "buttonActiveStart": {
          "color": "#b8bf88",
          "alpha": 0.96
        },
        "buttonActiveEnd": {
          "color": "#9b9b7d",
          "alpha": 0.96
        },
        "buttonActiveBorder": {
          "color": "#1c3145",
          "alpha": 1
        },
        "divider": {
          "color": "#80b5e8",
          "alpha": 0.22
        },
        "shellDivider": {
          "color": "#1d262f",
          "alpha": 1
        },
        "actionSafeBg": {
          "color": "#8ea857",
          "alpha": 0.92
        },
        "actionSafeBorder": {
          "color": "#213445",
          "alpha": 1
        },
        "actionSafeIcon": {
          "color": "#243b51",
          "alpha": 0.98
        },
        "actionCreateBg": {
          "color": "#b7bc71",
          "alpha": 0.92
        },
        "actionCreateBorder": {
          "color": "#7a93ad",
          "alpha": 0.18
        },
        "actionCreateText": {
          "color": "#142839",
          "alpha": 1
        },
        "actionCreateHoverBg": {
          "color": "#9fa583",
          "alpha": 0.96
        },
        "actionCreateHoverText": {
          "color": "#d8ecff",
          "alpha": 0.96
        },
        "actionSettingsBg": {
          "color": "#334f6b",
          "alpha": 0.92
        },
        "actionSettingsBorder": {
          "color": "#22303f",
          "alpha": 1
        },
        "actionSettingsIcon": {
          "color": "#edf3f8",
          "alpha": 1
        },
        "text": {
          "color": "#edf3f8",
          "alpha": 1
        },
        "mutedText": {
          "color": "#b7c5d3",
          "alpha": 0.82
        },
        "headerRule": {
          "color": "#7d94ac",
          "alpha": 0.74
        },
        "icon": {
          "color": "#d9e4ee",
          "alpha": 0.96
        },
        "iconHover": {
          "color": "#f6fbff",
          "alpha": 0.98
        },
        "iconActive": {
          "color": "#18212c",
          "alpha": 0.96
        },
        "surfaceImage": "",
        "surfaceImageAlpha": 0,
        "surfaceImageScale": 1,
        "surfaceImageRepeat": "repeat",
        "cardImage": "",
        "cardImageAlpha": 0,
        "cardImageScale": 1,
        "cardImageRepeat": "repeat",
        "cardRadius": 20,
        "cardBlurEnabled": false,
        "border1Width": 1,
        "border2Width": 1,
        "buttonBorderWidth": 1,
        "buttonHoverBorderWidth": 1,
        "buttonActiveBorderWidth": 1,
        "tabRadius": 6,
        "actionSafeBorderWidth": 1,
        "actionSafeRadius": 4,
        "actionSafeIconSize": 1,
        "actionSettingsBorderWidth": 1,
        "actionSettingsRadius": 4,
        "actionSettingsIconSize": 1,
        "actionCreateBorderWidth": 1,
        "actionCreateRadius": 8
      },
      "content": {
        "appBackground": {
          "color": "#0f151d",
          "alpha": 1
        },
        "surfaceStart": {
          "color": "#18222d",
          "alpha": 1
        },
        "surfaceEnd": {
          "color": "#111922",
          "alpha": 0.96
        },
        "container": {
          "color": "#212d3a",
          "alpha": 0.8
        },
        "card": {
          "color": "#233448",
          "alpha": 0.32
        },
        "cardHover": {
          "color": "#253546",
          "alpha": 0.84
        },
        "formBackground": {
          "color": "#151d27",
          "alpha": 0.9
        },
        "divider": {
          "color": "#7289a1",
          "alpha": 0.14
        },
        "highlight": {
          "color": "#c0c78a",
          "alpha": 0.82
        },
        "scrollbar": {
          "color": "#7289a1",
          "alpha": 0.4
        },
        "shadow": {
          "color": "#030b18",
          "alpha": 0.34
        },
        "focusShadow": {
          "color": "#f0e493",
          "alpha": 0.12
        },
        "heading": {
          "color": "#bacc8a",
          "alpha": 1
        },
        "subheading": {
          "color": "#989c77",
          "alpha": 1
        },
        "buttonHoverHeading": {
          "color": "#ffffff",
          "alpha": 1
        },
        "label": {
          "color": "#d7e0e8",
          "alpha": 1
        },
        "text": {
          "color": "#e7edf3",
          "alpha": 1
        },
        "mutedText": {
          "color": "#b2bfcb",
          "alpha": 0.84
        },
        "buttonHoverSubText": {
          "color": "#eff5fb",
          "alpha": 0.95
        },
        "headerRule": {
          "color": "#7d94ac",
          "alpha": 0.72
        },
        "horizontal2": {
          "color": "#7d94ac",
          "alpha": 0.72
        },
        "border1": {
          "color": "#2c333a",
          "alpha": 0.31
        },
        "border2": {
          "color": "#232b34",
          "alpha": 1
        },
        "border3": {
          "color": "#7a93ad",
          "alpha": 0.1
        },
        "actionEditBg": {
          "color": "#314253",
          "alpha": 0.92
        },
        "actionEditIcon": {
          "color": "#edf4fb",
          "alpha": 0.96
        },
        "actionDuplicateBg": {
          "color": "#3b4861",
          "alpha": 0.92
        },
        "actionDuplicateIcon": {
          "color": "#e8eef8",
          "alpha": 0.96
        },
        "actionPlayBg": {
          "color": "#536f4b",
          "alpha": 0.5
        },
        "actionPlayIcon": {
          "color": "#ebffcb",
          "alpha": 0.98
        },
        "actionDeleteBg": {
          "color": "#5d3a40",
          "alpha": 0.42
        },
        "actionDeleteIcon": {
          "color": "#ffd8de",
          "alpha": 0.98
        },
        "actionSidebarBg": {
          "color": "#2e4053",
          "alpha": 0.92
        },
        "actionSidebarIcon": {
          "color": "#e3eef8",
          "alpha": 0.96
        },
        "actionGenericBg": {
          "color": "#2b3745",
          "alpha": 1
        },
        "actionGenericText": {
          "color": "#f1f6fb",
          "alpha": 1
        },
        "actionGenericBorder": {
          "color": "#7a93ad",
          "alpha": 0.18
        },
        "appBackgroundImage": "modules/footlights/assets/ui/fl_bgblur.webp",
        "appBackgroundImageAlpha": 0.06,
        "appBackgroundImageScale": 1.97,
        "appBackgroundImageRepeat": "repeat",
        "appBackgroundImageBlur": 3,
        "surfaceImage": "",
        "surfaceImageAlpha": 0,
        "surfaceImageScale": 3.71,
        "surfaceImageRepeat": "repeat",
        "surfaceImageBlur": 0,
        "containerImage": "",
        "containerImageAlpha": 0,
        "containerImageScale": 1,
        "containerImageRepeat": "repeat",
        "cardImage": "",
        "cardImageAlpha": 0,
        "cardImageScale": 1,
        "cardImageRepeat": "repeat",
        "surfaceRadius": 7,
        "containerRadius": 7,
        "cardRadius": 5,
        "cardHoverRadius": 4,
        "formRadius": 4,
        "border1Width": 1,
        "border2Width": 1,
        "border3Width": 1,
        "shadowBlur": 42,
        "shadowDistance": 18,
        "focusShadowBlur": 5,
        "focusShadowDistance": 2,
        "actionGenericBorderWidth": 1,
        "actionGenericRadius": 3,
        "actionEditIconSize": 1,
        "actionDuplicateIconSize": 1,
        "actionPlayIconSize": 1,
        "actionDeleteIconSize": 1,
        "actionSidebarIconSize": 1
      },
      "planner": {
        "heading": {
          "color": "#f1f6fb",
          "alpha": 1
        },
        "text": {
          "color": "#bcc9d6",
          "alpha": 0.92
        },
        "handle": {
          "color": "#9cb0c3",
          "alpha": 0.92
        },
        "actionIcon": {
          "color": "#ebffcb",
          "alpha": 0.98
        },
        "invertedHeading": {
          "color": "#081019",
          "alpha": 0.96
        },
        "invertedText": {
          "color": "#0d1722",
          "alpha": 0.92
        },
        "invertedHandle": {
          "color": "#0d1722",
          "alpha": 0.82
        },
        "invertedActionIcon": {
          "color": "#0d1722",
          "alpha": 0.96
        },
        "canvasStart": {
          "color": "#121a24",
          "alpha": 0.84
        },
        "canvasEnd": {
          "color": "#0d131b",
          "alpha": 0.82
        },
        "gridPrimary": {
          "color": "#7289a1",
          "alpha": 0.16
        },
        "gridSecondary": {
          "color": "#eef4fa",
          "alpha": 0.025
        },
        "toggleBg": {
          "color": "#2d3c4d",
          "alpha": 0.94
        },
        "toggleIcon": {
          "color": "#eef4fa",
          "alpha": 0.98
        },
        "backdrop": {
          "color": "#040a12",
          "alpha": 0.82
        },
        "backdropText": {
          "color": "#ffffff",
          "alpha": 0.34
        },
        "separator": {
          "color": "#7289a1",
          "alpha": 0.18
        }
      },
      "stageGoblin": {
        "surface": {
          "color": "#151d27",
          "alpha": 0.84
        },
        "border": {
          "color": "#7a93ad",
          "alpha": 0.18
        },
        "icon": {
          "color": "#dce7f0",
          "alpha": 0.96
        },
        "text": {
          "color": "#e7edf3",
          "alpha": 1
        },
        "iconSize": 0.92,
        "borderWidth": 1,
        "radius": 11,
        "tagFontSize": 0.62,
        "tagHeight": 26,
        "tagWidth": 92,
        "tagRadius": 4,
        "tagPaddingX": 0.42,
        "tagGlowEnabled": true,
        "tagGlowBlur": 14,
        "fontPreset": "subText"
      },
      "theatre": {
        "stageTitle": {
          "color": "#f1f6fb",
          "alpha": 1
        },
        "stageSubtitle": {
          "color": "#b2c2d1",
          "alpha": 0.96
        },
        "avatarName": {
          "color": "#edf4fb",
          "alpha": 0.98
        },
        "mood": {
          "color": "#ffffff",
          "alpha": 1
        },
        "titleBackground": {
          "color": "#18212d",
          "alpha": 0.9
        },
        "titleBackgroundBorder": {
          "color": "#7ebaec",
          "alpha": 0
        },
        "avatarNameBackground": {
          "color": "#1f2b38",
          "alpha": 0.92
        },
        "moodBackground": {
          "color": "#1f2b38",
          "alpha": 0.92
        },
        "gmBarBackground": {
          "color": "#1f2b38",
          "alpha": 0.92
        },
        "container1": {
          "color": "#1f2b38",
          "alpha": 0.92
        },
        "container1Border": {
          "color": "#7a93ad",
          "alpha": 0.18
        },
        "container2": {
          "color": "#283646",
          "alpha": 0.86
        },
        "container2Border": {
          "color": "#7a93ad",
          "alpha": 0.14
        },
        "container3": {
          "color": "#344252",
          "alpha": 0.9
        },
        "container3Border": {
          "color": "#7a93ad",
          "alpha": 0.16
        },
        "iconBackground": {
          "color": "#324253",
          "alpha": 0.92
        },
        "iconBorder": {
          "color": "#7a93ad",
          "alpha": 0.16
        },
        "iconColor": {
          "color": "#eef4fa",
          "alpha": 0.98
        },
        "stageFrame": {
          "color": "#7a93ad",
          "alpha": 0.18
        },
        "titleBackgroundBorderWidth": 0,
        "titleBackgroundRadius": 100,
        "gmBarImage": "",
        "gmBarImageAlpha": 0,
        "gmBarImageScale": 1,
        "gmBarImageRepeat": "repeat",
        "gmBarRadius": 18,
        "container1BorderWidth": 1,
        "container1Radius": 18,
        "container1BlurEnabled": true,
        "container2BorderWidth": 1,
        "container2Radius": 16,
        "container2BlurEnabled": true,
        "container3BorderWidth": 1,
        "container3Radius": 14,
        "container3BlurEnabled": false,
        "iconBorderWidth": 1,
        "stageTitleSize": 1.42,
        "stageTitleFont": "",
        "stageSubtitleSize": 0.94,
        "stageSubtitleFont": "",
        "avatarNameSize": 1.02,
        "moodSize": 1.02,
        "stageFrameWidth": 1,
        "stageFrameRadius": 24
      }
    }
  },
  {
    "id": "builtin-fantasy-parchment",
    "name": "Fantasy Parchment",
    "theme": {
      "typography": {
        "heading1": 1.48,
        "heading2": 1.2,
        "heading2Hover": 1.18,
        "heading3": 1.02,
        "body": 0.94,
        "subText": 0.82,
        "subTextHover": 0.82,
        "microText": 0.72,
        "labelText": 0.82,
        "navigationSize": 0.76,
        "heading1Font": "",
        "heading2Font": "",
        "heading3Font": "",
        "bodyFont": "",
        "subTextFont": "",
        "microTextFont": "",
        "labelTextFont": "",
        "navigationFont": ""
      },
      "navigation": {
        "surfaceStart": {
          "color": "#e8dcc8",
          "alpha": 0.97
        },
        "surfaceEnd": {
          "color": "#dcd0bc",
          "alpha": 0.97
        },
        "cardStart": {
          "color": "#f2e9d9",
          "alpha": 0.95
        },
        "cardEnd": {
          "color": "#e7dbc7",
          "alpha": 0.95
        },
        "titleBarStart": {
          "color": "#d9ccb5",
          "alpha": 0.98
        },
        "titleBarEnd": {
          "color": "#dacdb9",
          "alpha": 1
        },
        "border1": {
          "color": "#8a6a3d",
          "alpha": 0.3
        },
        "border2": {
          "color": "#8a6a3d",
          "alpha": 0.18
        },
        "buttonStart": {
          "color": "#efe4d2",
          "alpha": 0.98
        },
        "buttonEnd": {
          "color": "#ddcfb7",
          "alpha": 0.98
        },
        "buttonBorder": {
          "color": "#b7a78f",
          "alpha": 0.65
        },
        "buttonHoverStart": {
          "color": "#f6ecdc",
          "alpha": 0.99
        },
        "buttonHoverEnd": {
          "color": "#e4d7c1",
          "alpha": 0.99
        },
        "buttonHoverBorder": {
          "color": "#8a6a3d",
          "alpha": 0.38
        },
        "buttonActiveStart": {
          "color": "#8b5c2e",
          "alpha": 0.98
        },
        "buttonActiveEnd": {
          "color": "#68411d",
          "alpha": 0.98
        },
        "buttonActiveBorder": {
          "color": "#f4dfb8",
          "alpha": 0.82
        },
        "divider": {
          "color": "#80b5e8",
          "alpha": 0.22
        },
        "shellDivider": {
          "color": "#8a6a3d",
          "alpha": 0.2
        },
        "actionSafeBg": {
          "color": "#ccb28a",
          "alpha": 0.65
        },
        "actionSafeBorder": {
          "color": "#80b5e8",
          "alpha": 0.22
        },
        "actionSafeIcon": {
          "color": "#8e6e52",
          "alpha": 0.96
        },
        "actionCreateBg": {
          "color": "#d5b17b",
          "alpha": 0.73
        },
        "actionCreateBorder": {
          "color": "#8a6a3d",
          "alpha": 0.24
        },
        "actionCreateText": {
          "color": "#636f4d",
          "alpha": 0.98
        },
        "actionCreateHoverBg": {
          "color": "#243f5d",
          "alpha": 0.96
        },
        "actionCreateHoverText": {
          "color": "#d8ecff",
          "alpha": 0.96
        },
        "actionSettingsBg": {
          "color": "#ccb28a",
          "alpha": 0.52
        },
        "actionSettingsBorder": {
          "color": "#8a6a3d",
          "alpha": 0.24
        },
        "actionSettingsIcon": {
          "color": "#7f7c57",
          "alpha": 1
        },
        "text": {
          "color": "#2f2419",
          "alpha": 0.62
        },
        "mutedText": {
          "color": "#5e4c39",
          "alpha": 0.82
        },
        "headerRule": {
          "color": "#8b5c2e",
          "alpha": 0.94
        },
        "icon": {
          "color": "#5e4526",
          "alpha": 0.96
        },
        "iconHover": {
          "color": "#2c2012",
          "alpha": 0.98
        },
        "iconActive": {
          "color": "#fff5e6",
          "alpha": 0.96
        },
        "surfaceImage": "",
        "surfaceImageAlpha": 0,
        "surfaceImageScale": 1,
        "surfaceImageRepeat": "repeat",
        "cardImage": "",
        "cardImageAlpha": 0,
        "cardImageScale": 1,
        "cardImageRepeat": "repeat",
        "cardRadius": 20,
        "cardBlurEnabled": false,
        "border1Width": 1,
        "border2Width": 1,
        "buttonBorderWidth": 1,
        "buttonHoverBorderWidth": 1,
        "buttonActiveBorderWidth": 1,
        "tabRadius": 8,
        "actionSafeBorderWidth": 1,
        "actionSafeRadius": 5,
        "actionSafeIconSize": 1,
        "actionSettingsBorderWidth": 1,
        "actionSettingsRadius": 5,
        "actionSettingsIconSize": 1,
        "actionCreateBorderWidth": 1,
        "actionCreateRadius": 8
      },
      "content": {
        "appBackground": {
          "color": "#f4ecdf",
          "alpha": 1
        },
        "surfaceStart": {
          "color": "#efe6d8",
          "alpha": 0.98
        },
        "surfaceEnd": {
          "color": "#e2d6c3",
          "alpha": 0.96
        },
        "container": {
          "color": "#eadfce",
          "alpha": 0.88
        },
        "card": {
          "color": "#ddd0bb",
          "alpha": 0.72
        },
        "cardHover": {
          "color": "#d4c4ab",
          "alpha": 0.84
        },
        "formBackground": {
          "color": "#f7efe3",
          "alpha": 0.92
        },
        "divider": {
          "color": "#8b5c2e",
          "alpha": 0.16
        },
        "highlight": {
          "color": "#83f0ec",
          "alpha": 0.82
        },
        "scrollbar": {
          "color": "#b4a18e",
          "alpha": 0.44
        },
        "shadow": {
          "color": "#030b18",
          "alpha": 0.14
        },
        "focusShadow": {
          "color": "#83f0ec",
          "alpha": 0.72
        },
        "heading": {
          "color": "#2f2419",
          "alpha": 0.77
        },
        "subheading": {
          "color": "#7b5a34",
          "alpha": 0.94
        },
        "buttonHoverHeading": {
          "color": "#20160d",
          "alpha": 1
        },
        "label": {
          "color": "#4e3b28",
          "alpha": 0.94
        },
        "text": {
          "color": "#35281c",
          "alpha": 1
        },
        "mutedText": {
          "color": "#6b5945",
          "alpha": 0.82
        },
        "buttonHoverSubText": {
          "color": "#4f3d2a",
          "alpha": 0.94
        },
        "headerRule": {
          "color": "#8b5c2e",
          "alpha": 0.94
        },
        "horizontal2": {
          "color": "#8b5c2e",
          "alpha": 0.27
        },
        "border1": {
          "color": "#dac2a9",
          "alpha": 0.66
        },
        "border2": {
          "color": "#b9a692",
          "alpha": 0.58
        },
        "border3": {
          "color": "#8b5c2e",
          "alpha": 0.16
        },
        "actionEditBg": {
          "color": "#b59a74",
          "alpha": 0.92
        },
        "actionEditIcon": {
          "color": "#2d2011",
          "alpha": 0.48
        },
        "actionDuplicateBg": {
          "color": "#9f8f7b",
          "alpha": 0.92
        },
        "actionDuplicateIcon": {
          "color": "#2b2520",
          "alpha": 0.44
        },
        "actionPlayBg": {
          "color": "#7f8f4e",
          "alpha": 0.28
        },
        "actionPlayIcon": {
          "color": "#c29e6b",
          "alpha": 0.98
        },
        "actionDeleteBg": {
          "color": "#8c5b55",
          "alpha": 0.4
        },
        "actionDeleteIcon": {
          "color": "#fff1ec",
          "alpha": 0.98
        },
        "actionSidebarBg": {
          "color": "#c8b18e",
          "alpha": 0.92
        },
        "actionSidebarIcon": {
          "color": "#332414",
          "alpha": 0.5
        },
        "actionGenericBg": {
          "color": "#e8dcc8",
          "alpha": 0.96
        },
        "actionGenericText": {
          "color": "#2f2419",
          "alpha": 0.37
        },
        "actionGenericBorder": {
          "color": "#8b5c2e",
          "alpha": 0.24
        },
        "appBackgroundImage": "",
        "appBackgroundImageAlpha": 0,
        "appBackgroundImageScale": 1,
        "appBackgroundImageRepeat": "repeat",
        "appBackgroundImageBlur": 0,
        "surfaceImage": "",
        "surfaceImageAlpha": 0,
        "surfaceImageScale": 1,
        "surfaceImageRepeat": "repeat",
        "surfaceImageBlur": 0,
        "containerImage": "",
        "containerImageAlpha": 0,
        "containerImageScale": 1,
        "containerImageRepeat": "repeat",
        "cardImage": "",
        "cardImageAlpha": 0,
        "cardImageScale": 1,
        "cardImageRepeat": "repeat",
        "surfaceRadius": 9,
        "containerRadius": 7,
        "cardRadius": 7,
        "cardHoverRadius": 16,
        "formRadius": 12,
        "border1Width": 1,
        "border2Width": 1,
        "border3Width": 1,
        "shadowBlur": 12.1,
        "shadowDistance": 6.7,
        "focusShadowBlur": 0,
        "focusShadowDistance": 2,
        "actionGenericBorderWidth": 1,
        "actionGenericRadius": 14,
        "actionEditIconSize": 1,
        "actionDuplicateIconSize": 1,
        "actionPlayIconSize": 1,
        "actionDeleteIconSize": 1,
        "actionSidebarIconSize": 1
      },
      "planner": {
        "heading": {
          "color": "#2f2419",
          "alpha": 1
        },
        "text": {
          "color": "#5f4e3b",
          "alpha": 0.92
        },
        "handle": {
          "color": "#7b5a34",
          "alpha": 0.9
        },
        "actionIcon": {
          "color": "#6c7d37",
          "alpha": 0.98
        },
        "invertedHeading": {
          "color": "#081019",
          "alpha": 0.96
        },
        "invertedText": {
          "color": "#0d1722",
          "alpha": 0.92
        },
        "invertedHandle": {
          "color": "#0d1722",
          "alpha": 0.82
        },
        "invertedActionIcon": {
          "color": "#0d1722",
          "alpha": 0.96
        },
        "canvasStart": {
          "color": "#e8dcc8",
          "alpha": 0.9
        },
        "canvasEnd": {
          "color": "#d7cab3",
          "alpha": 0.88
        },
        "gridPrimary": {
          "color": "#8b5c2e",
          "alpha": 0.14
        },
        "gridSecondary": {
          "color": "#3a2d21",
          "alpha": 0.04
        },
        "toggleBg": {
          "color": "#d9c9ae",
          "alpha": 0.94
        },
        "toggleIcon": {
          "color": "#3a2a18",
          "alpha": 0.98
        },
        "backdrop": {
          "color": "#040a12",
          "alpha": 0.82
        },
        "backdropText": {
          "color": "#ffffff",
          "alpha": 0.34
        },
        "separator": {
          "color": "#8b5c2e",
          "alpha": 0.18
        }
      },
      "stageGoblin": {
        "surface": {
          "color": "#dbcbb2",
          "alpha": 0.9
        },
        "border": {
          "color": "#8b5c2e",
          "alpha": 0.2
        },
        "icon": {
          "color": "#4c391f",
          "alpha": 0.96
        },
        "text": {
          "color": "#2f2419",
          "alpha": 1
        },
        "iconSize": 0.92,
        "borderWidth": 1,
        "radius": 11,
        "tagFontSize": 0.62,
        "tagHeight": 26,
        "tagWidth": 92,
        "tagRadius": 4,
        "tagPaddingX": 0.42,
        "tagGlowEnabled": false,
        "tagGlowBlur": 14,
        "fontPreset": "subText"
      },
      "theatre": {
        "stageTitle": {
          "color": "#2f2419",
          "alpha": 1
        },
        "stageSubtitle": {
          "color": "#5d4a36",
          "alpha": 0.96
        },
        "avatarName": {
          "color": "#2f2419",
          "alpha": 0.98
        },
        "mood": {
          "color": "#43311f",
          "alpha": 1
        },
        "titleBackground": {
          "color": "#efe2cf",
          "alpha": 0.92
        },
        "titleBackgroundBorder": {
          "color": "#7ebaec",
          "alpha": 0
        },
        "avatarNameBackground": {
          "color": "#e3d3bc",
          "alpha": 0.94
        },
        "moodBackground": {
          "color": "#e3d3bc",
          "alpha": 0.94
        },
        "gmBarBackground": {
          "color": "#e3d3bc",
          "alpha": 0.94
        },
        "container1": {
          "color": "#e3d3bc",
          "alpha": 0.94
        },
        "container1Border": {
          "color": "#8b5c2e",
          "alpha": 0.24
        },
        "container2": {
          "color": "#d8c7ad",
          "alpha": 0.9
        },
        "container2Border": {
          "color": "#8b5c2e",
          "alpha": 0.2
        },
        "container3": {
          "color": "#cdb997",
          "alpha": 0.94
        },
        "container3Border": {
          "color": "#8b5c2e",
          "alpha": 0.24
        },
        "iconBackground": {
          "color": "#c7ae88",
          "alpha": 0.94
        },
        "iconBorder": {
          "color": "#8b5c2e",
          "alpha": 0.24
        },
        "iconColor": {
          "color": "#352617",
          "alpha": 0.98
        },
        "stageFrame": {
          "color": "#8b5c2e",
          "alpha": 0.26
        },
        "titleBackgroundBorderWidth": 0,
        "titleBackgroundRadius": 100,
        "gmBarImage": "",
        "gmBarImageAlpha": 0,
        "gmBarImageScale": 1,
        "gmBarImageRepeat": "repeat",
        "gmBarRadius": 18,
        "container1BorderWidth": 1,
        "container1Radius": 18,
        "container1BlurEnabled": true,
        "container2BorderWidth": 1,
        "container2Radius": 16,
        "container2BlurEnabled": true,
        "container3BorderWidth": 1,
        "container3Radius": 14,
        "container3BlurEnabled": false,
        "iconBorderWidth": 1,
        "stageTitleSize": 1.42,
        "stageTitleFont": "",
        "stageSubtitleSize": 0.94,
        "stageSubtitleFont": "",
        "avatarNameSize": 1.02,
        "moodSize": 1.02,
        "stageFrameWidth": 1,
        "stageFrameRadius": 24
      }
    }
  },
  {
    "id": "builtin-cyberpunk-grid",
    "name": "Cyberpunk Grid",
    "theme": {
      "typography": {
        "heading1": 1.5,
        "heading2": 1.2,
        "heading3": 1.04,
        "body": 0.95,
        "subText": 0.82,
        "microText": 0.72
      },
      "navigation": {
        "surfaceStart": {
          "color": "#071928",
          "alpha": 0.96
        },
        "surfaceEnd": {
          "color": "#030c15",
          "alpha": 0.96
        },
        "cardStart": {
          "color": "#0d2b3b",
          "alpha": 0.92
        },
        "cardEnd": {
          "color": "#071722",
          "alpha": 0.92
        },
        "titleBarStart": {
          "color": "#081d29",
          "alpha": 0.98
        },
        "titleBarEnd": {
          "color": "#030c15",
          "alpha": 0.98
        },
        "border1": {
          "color": "#54f3d5",
          "alpha": 0.34
        },
        "border2": {
          "color": "#54f3d5",
          "alpha": 0.22
        },
        "buttonStart": {
          "color": "#0c3040",
          "alpha": 0.96
        },
        "buttonEnd": {
          "color": "#061a26",
          "alpha": 0.96
        },
        "buttonBorder": {
          "color": "#60e6ff",
          "alpha": 0.24
        },
        "buttonHoverStart": {
          "color": "#0f4456",
          "alpha": 0.98
        },
        "buttonHoverEnd": {
          "color": "#082330",
          "alpha": 0.98
        },
        "buttonHoverBorder": {
          "color": "#78fff2",
          "alpha": 0.44
        },
        "buttonActiveStart": {
          "color": "#5bf2cf",
          "alpha": 0.98
        },
        "buttonActiveEnd": {
          "color": "#1ec0b8",
          "alpha": 0.98
        },
        "buttonActiveBorder": {
          "color": "#b8fff6",
          "alpha": 0.8
        },
        "actionSafeBg": {
          "color": "#11445a",
          "alpha": 0.92
        },
        "actionSafeIcon": {
          "color": "#c7fbff",
          "alpha": 0.98
        },
        "shellDivider": {
          "color": "#4fd6ff",
          "alpha": 0.3
        },
        "text": {
          "color": "#e9fbff",
          "alpha": 1
        },
        "mutedText": {
          "color": "#b6ebf1",
          "alpha": 0.84
        },
        "headerRule": {
          "color": "#ff5b9e",
          "alpha": 0.92
        },
        "icon": {
          "color": "#9eefff",
          "alpha": 0.96
        },
        "iconHover": {
          "color": "#d5ffff",
          "alpha": 1
        },
        "iconActive": {
          "color": "#04212a",
          "alpha": 0.98
        }
      },
      "content": {
        "appBackground": {
          "color": "#040b14",
          "alpha": 1
        },
        "surfaceStart": {
          "color": "#081b26",
          "alpha": 0.96
        },
        "surfaceEnd": {
          "color": "#05111a",
          "alpha": 0.94
        },
        "container": {
          "color": "#123343",
          "alpha": 0.74
        },
        "card": {
          "color": "#16485b",
          "alpha": 0.58
        },
        "cardHover": {
          "color": "#1e6075",
          "alpha": 0.7
        },
        "formBackground": {
          "color": "#0c2634",
          "alpha": 0.88
        },
        "divider": {
          "color": "#49d5ff",
          "alpha": 0.18
        },
        "scrollbar": {
          "color": "#49d5ff",
          "alpha": 0.5
        },
        "heading": {
          "color": "#f4fdff",
          "alpha": 1
        },
        "subheading": {
          "color": "#7be7ff",
          "alpha": 0.98
        },
        "buttonHoverHeading": {
          "color": "#eeffff",
          "alpha": 1
        },
        "label": {
          "color": "#bff6e2",
          "alpha": 0.94
        },
        "text": {
          "color": "#e8faff",
          "alpha": 1
        },
        "mutedText": {
          "color": "#b6dde5",
          "alpha": 0.82
        },
        "buttonHoverSubText": {
          "color": "#ddfeff",
          "alpha": 0.96
        },
        "headerRule": {
          "color": "#ff5b9e",
          "alpha": 0.92
        },
        "horizontal2": {
          "color": "#ff5b9e",
          "alpha": 0.92
        },
        "border1": {
          "color": "#54f3d5",
          "alpha": 0.3
        },
        "border2": {
          "color": "#49d5ff",
          "alpha": 0.24
        },
        "border3": {
          "color": "#49d5ff",
          "alpha": 0.18
        },
        "actionEditBg": {
          "color": "#11445a",
          "alpha": 0.92
        },
        "actionEditIcon": {
          "color": "#bdf6ff",
          "alpha": 0.96
        },
        "actionDuplicateBg": {
          "color": "#303d7a",
          "alpha": 0.92
        },
        "actionDuplicateIcon": {
          "color": "#dae0ff",
          "alpha": 0.96
        },
        "actionPlayBg": {
          "color": "#1f6d58",
          "alpha": 0.54
        },
        "actionPlayIcon": {
          "color": "#cdff86",
          "alpha": 0.98
        },
        "actionDeleteBg": {
          "color": "#641a39",
          "alpha": 0.44
        },
        "actionDeleteIcon": {
          "color": "#ff84bb",
          "alpha": 0.98
        },
        "actionSidebarBg": {
          "color": "#11394f",
          "alpha": 0.92
        },
        "actionSidebarIcon": {
          "color": "#c6f6ff",
          "alpha": 0.96
        },
        "actionGenericBg": {
          "color": "#10384d",
          "alpha": 0.92
        },
        "actionGenericText": {
          "color": "#ecfeff",
          "alpha": 1
        },
        "actionGenericBorder": {
          "color": "#49d5ff",
          "alpha": 0.22
        },
        "actionGenericBorderWidth": 1,
        "actionGenericRadius": 14
      },
      "planner": {
        "canvasStart": {
          "color": "#071824",
          "alpha": 0.82
        },
        "canvasEnd": {
          "color": "#040d15",
          "alpha": 0.8
        },
        "gridPrimary": {
          "color": "#4dd6ff",
          "alpha": 0.18
        },
        "gridSecondary": {
          "color": "#dfffff",
          "alpha": 0.028
        },
        "heading": {
          "color": "#f0fdff",
          "alpha": 1
        },
        "text": {
          "color": "#beeff6",
          "alpha": 0.92
        },
        "handle": {
          "color": "#75edff",
          "alpha": 0.94
        },
        "actionIcon": {
          "color": "#d7ff86",
          "alpha": 0.98
        },
        "separator": {
          "color": "#49d5ff",
          "alpha": 0.24
        },
        "toggleBg": {
          "color": "#0f3444",
          "alpha": 0.94
        },
        "toggleIcon": {
          "color": "#6ff5dc",
          "alpha": 0.98
        }
      },
      "theatre": {
        "stageTitle": {
          "color": "#f4fdff",
          "alpha": 1
        },
        "stageSubtitle": {
          "color": "#7be7ff",
          "alpha": 0.98
        },
        "avatarName": {
          "color": "#d8fff5",
          "alpha": 0.98
        },
        "mood": {
          "color": "#f1ffe0",
          "alpha": 1
        },
        "titleBackground": {
          "color": "#071722",
          "alpha": 0.9
        },
        "avatarNameBackground": {
          "color": "#0a1f2d",
          "alpha": 0.92
        },
        "moodBackground": {
          "color": "#0a1f2d",
          "alpha": 0.92
        },
        "gmBarBackground": {
          "color": "#0a1f2d",
          "alpha": 0.92
        },
        "container1": {
          "color": "#0a1f2d",
          "alpha": 0.92
        },
        "container1Border": {
          "color": "#49d5ff",
          "alpha": 0.26
        },
        "container1BorderWidth": 1,
        "container1Radius": 18,
        "container1BlurEnabled": true,
        "container2": {
          "color": "#0f3044",
          "alpha": 0.86
        },
        "container2Border": {
          "color": "#49d5ff",
          "alpha": 0.22
        },
        "container2BorderWidth": 1,
        "container2Radius": 16,
        "container2BlurEnabled": true,
        "container3": {
          "color": "#10384d",
          "alpha": 0.9
        },
        "container3Border": {
          "color": "#54f3d5",
          "alpha": 0.3
        },
        "container3BorderWidth": 1,
        "container3Radius": 14,
        "container3BlurEnabled": false,
        "iconBackground": {
          "color": "#10384d",
          "alpha": 0.92
        },
        "iconBorder": {
          "color": "#49d5ff",
          "alpha": 0.28
        },
        "iconColor": {
          "color": "#c7fbff",
          "alpha": 0.98
        },
        "stageFrame": {
          "color": "#54f3d5",
          "alpha": 0.3
        }
      },
      "stageGoblin": {
        "surface": {
          "color": "#06121d",
          "alpha": 0.84
        },
        "border": {
          "color": "#49d5ff",
          "alpha": 0.24
        },
        "icon": {
          "color": "#9ef3ff",
          "alpha": 0.96
        },
        "text": {
          "color": "#f4fdff",
          "alpha": 1
        },
        "iconSize": 0.92,
        "borderWidth": 1,
        "radius": 11,
        "fontPreset": "subText",
        "tagFontSize": 0.62,
        "tagHeight": 26,
        "tagWidth": 92,
        "tagRadius": 4,
        "tagPaddingX": 0.42,
        "tagGlowEnabled": true,
        "tagGlowBlur": 14
      }
    }
  },
  {
    "id": "builtin-futuristic-orbit",
    "name": "Futuristic Orbit",
    "theme": {
      "typography": {
        "heading1": 1.46,
        "heading2": 1.18,
        "heading3": 1.04,
        "body": 0.95,
        "subText": 0.84,
        "microText": 0.72
      },
      "navigation": {
        "surfaceStart": {
          "color": "#1b0d26",
          "alpha": 0.96
        },
        "surfaceEnd": {
          "color": "#0d0714",
          "alpha": 0.96
        },
        "cardStart": {
          "color": "#34184a",
          "alpha": 0.9
        },
        "cardEnd": {
          "color": "#170a23",
          "alpha": 0.9
        },
        "titleBarStart": {
          "color": "#241133",
          "alpha": 0.98
        },
        "titleBarEnd": {
          "color": "#0d0714",
          "alpha": 0.98
        },
        "border1": {
          "color": "#f28cd6",
          "alpha": 0.32
        },
        "border2": {
          "color": "#a29cff",
          "alpha": 0.22
        },
        "buttonStart": {
          "color": "#35174a",
          "alpha": 0.96
        },
        "buttonEnd": {
          "color": "#180b24",
          "alpha": 0.96
        },
        "buttonBorder": {
          "color": "#f28cd6",
          "alpha": 0.22
        },
        "buttonHoverStart": {
          "color": "#51246c",
          "alpha": 0.98
        },
        "buttonHoverEnd": {
          "color": "#261035",
          "alpha": 0.98
        },
        "buttonHoverBorder": {
          "color": "#ffb9ec",
          "alpha": 0.42
        },
        "buttonActiveStart": {
          "color": "#c95dff",
          "alpha": 0.96
        },
        "buttonActiveEnd": {
          "color": "#7a4bff",
          "alpha": 0.96
        },
        "buttonActiveBorder": {
          "color": "#f7c9ff",
          "alpha": 0.78
        },
        "actionSafeBg": {
          "color": "#4b2368",
          "alpha": 0.92
        },
        "actionSafeIcon": {
          "color": "#f7deff",
          "alpha": 0.98
        },
        "shellDivider": {
          "color": "#ff8ad5",
          "alpha": 0.28
        },
        "text": {
          "color": "#f9f0ff",
          "alpha": 1
        },
        "mutedText": {
          "color": "#e5c9f6",
          "alpha": 0.84
        },
        "headerRule": {
          "color": "#ff6d88",
          "alpha": 0.94
        },
        "icon": {
          "color": "#f3bcff",
          "alpha": 0.96
        },
        "iconHover": {
          "color": "#ffe7ff",
          "alpha": 1
        },
        "iconActive": {
          "color": "#1a0b25",
          "alpha": 0.98
        }
      },
      "content": {
        "appBackground": {
          "color": "#0c0813",
          "alpha": 1
        },
        "surfaceStart": {
          "color": "#1a0f28",
          "alpha": 0.96
        },
        "surfaceEnd": {
          "color": "#0d0714",
          "alpha": 0.94
        },
        "container": {
          "color": "#34194b",
          "alpha": 0.74
        },
        "card": {
          "color": "#562873",
          "alpha": 0.56
        },
        "cardHover": {
          "color": "#703699",
          "alpha": 0.68
        },
        "formBackground": {
          "color": "#241235",
          "alpha": 0.86
        },
        "divider": {
          "color": "#f28cd6",
          "alpha": 0.18
        },
        "scrollbar": {
          "color": "#f28cd6",
          "alpha": 0.48
        },
        "heading": {
          "color": "#fff4ff",
          "alpha": 1
        },
        "subheading": {
          "color": "#f4a7ff",
          "alpha": 0.96
        },
        "buttonHoverHeading": {
          "color": "#fff3ff",
          "alpha": 1
        },
        "label": {
          "color": "#ffd4e8",
          "alpha": 0.94
        },
        "text": {
          "color": "#f7ebff",
          "alpha": 1
        },
        "mutedText": {
          "color": "#dcbce7",
          "alpha": 0.82
        },
        "buttonHoverSubText": {
          "color": "#ffeaff",
          "alpha": 0.94
        },
        "headerRule": {
          "color": "#ff6d88",
          "alpha": 0.94
        },
        "horizontal2": {
          "color": "#ff6d88",
          "alpha": 0.94
        },
        "border1": {
          "color": "#f28cd6",
          "alpha": 0.3
        },
        "border2": {
          "color": "#a29cff",
          "alpha": 0.24
        },
        "border3": {
          "color": "#a29cff",
          "alpha": 0.18
        },
        "actionEditBg": {
          "color": "#4a2366",
          "alpha": 0.92
        },
        "actionEditIcon": {
          "color": "#f1d4ff",
          "alpha": 0.96
        },
        "actionDuplicateBg": {
          "color": "#34408c",
          "alpha": 0.92
        },
        "actionDuplicateIcon": {
          "color": "#e0e5ff",
          "alpha": 0.96
        },
        "actionPlayBg": {
          "color": "#45682f",
          "alpha": 0.5
        },
        "actionPlayIcon": {
          "color": "#e9ff9a",
          "alpha": 0.98
        },
        "actionDeleteBg": {
          "color": "#691735",
          "alpha": 0.44
        },
        "actionDeleteIcon": {
          "color": "#ff8db7",
          "alpha": 0.98
        },
        "actionSidebarBg": {
          "color": "#3b1d52",
          "alpha": 0.92
        },
        "actionSidebarIcon": {
          "color": "#f3d7ff",
          "alpha": 0.96
        },
        "actionGenericBg": {
          "color": "#472060",
          "alpha": 0.92
        },
        "actionGenericText": {
          "color": "#fbecff",
          "alpha": 1
        },
        "actionGenericBorder": {
          "color": "#f28cd6",
          "alpha": 0.24
        },
        "actionGenericBorderWidth": 1,
        "actionGenericRadius": 14
      },
      "planner": {
        "canvasStart": {
          "color": "#140b1e",
          "alpha": 0.82
        },
        "canvasEnd": {
          "color": "#0a0611",
          "alpha": 0.8
        },
        "gridPrimary": {
          "color": "#f28cd6",
          "alpha": 0.16
        },
        "gridSecondary": {
          "color": "#fff0ff",
          "alpha": 0.025
        },
        "heading": {
          "color": "#fff5ff",
          "alpha": 1
        },
        "text": {
          "color": "#ebcff6",
          "alpha": 0.92
        },
        "handle": {
          "color": "#f3a6ff",
          "alpha": 0.92
        },
        "actionIcon": {
          "color": "#eaff9a",
          "alpha": 0.98
        },
        "separator": {
          "color": "#f28cd6",
          "alpha": 0.22
        },
        "toggleBg": {
          "color": "#34184a",
          "alpha": 0.94
        },
        "toggleIcon": {
          "color": "#ffb4e7",
          "alpha": 0.98
        }
      },
      "theatre": {
        "stageTitle": {
          "color": "#fff6ff",
          "alpha": 1
        },
        "stageSubtitle": {
          "color": "#f3bbff",
          "alpha": 0.98
        },
        "avatarName": {
          "color": "#ffe0f1",
          "alpha": 0.98
        },
        "mood": {
          "color": "#f6ffd0",
          "alpha": 1
        },
        "titleBackground": {
          "color": "#12091b",
          "alpha": 0.9
        },
        "avatarNameBackground": {
          "color": "#1a0d26",
          "alpha": 0.92
        },
        "moodBackground": {
          "color": "#1a0d26",
          "alpha": 0.92
        },
        "gmBarBackground": {
          "color": "#1a0d26",
          "alpha": 0.92
        },
        "container1": {
          "color": "#1a0d26",
          "alpha": 0.92
        },
        "container1Border": {
          "color": "#f28cd6",
          "alpha": 0.26
        },
        "container1BorderWidth": 1,
        "container1Radius": 18,
        "container1BlurEnabled": true,
        "container2": {
          "color": "#331447",
          "alpha": 0.86
        },
        "container2Border": {
          "color": "#f28cd6",
          "alpha": 0.22
        },
        "container2BorderWidth": 1,
        "container2Radius": 16,
        "container2BlurEnabled": true,
        "container3": {
          "color": "#472060",
          "alpha": 0.9
        },
        "container3Border": {
          "color": "#f28cd6",
          "alpha": 0.3
        },
        "container3BorderWidth": 1,
        "container3Radius": 14,
        "container3BlurEnabled": false,
        "iconBackground": {
          "color": "#472060",
          "alpha": 0.92
        },
        "iconBorder": {
          "color": "#f28cd6",
          "alpha": 0.28
        },
        "iconColor": {
          "color": "#f7deff",
          "alpha": 0.98
        },
        "stageFrame": {
          "color": "#f28cd6",
          "alpha": 0.28
        }
      },
      "stageGoblin": {
        "surface": {
          "color": "#0d0714",
          "alpha": 0.84
        },
        "border": {
          "color": "#f28cd6",
          "alpha": 0.22
        },
        "icon": {
          "color": "#f3bcff",
          "alpha": 0.96
        },
        "text": {
          "color": "#fff4ff",
          "alpha": 1
        },
        "iconSize": 0.92,
        "borderWidth": 1,
        "radius": 11,
        "fontPreset": "subText",
        "tagFontSize": 0.62,
        "tagHeight": 26,
        "tagWidth": 92,
        "tagRadius": 4,
        "tagPaddingX": 0.42,
        "tagGlowEnabled": true,
        "tagGlowBlur": 14
      }
    }
  },
  {
    "id": "builtin-muted-crimson",
    "name": "Muted Crimson",
    "theme": {
      "typography": {
        "heading1": 1.46,
        "heading2": 1.18,
        "heading3": 1.02,
        "body": 0.94,
        "subText": 0.82,
        "microText": 0.72
      },
      "navigation": {
        "surfaceStart": {
          "color": "#2a1f23",
          "alpha": 0.96
        },
        "surfaceEnd": {
          "color": "#191115",
          "alpha": 0.96
        },
        "cardStart": {
          "color": "#3a2a30",
          "alpha": 0.94
        },
        "cardEnd": {
          "color": "#22171b",
          "alpha": 0.94
        },
        "titleBarStart": {
          "color": "#302328",
          "alpha": 0.98
        },
        "titleBarEnd": {
          "color": "#1a1216",
          "alpha": 0.98
        },
        "border1": {
          "color": "#b99096",
          "alpha": 0.2
        },
        "border2": {
          "color": "#b99096",
          "alpha": 0.12
        },
        "buttonStart": {
          "color": "#463239",
          "alpha": 0.96
        },
        "buttonEnd": {
          "color": "#2c1f25",
          "alpha": 0.96
        },
        "buttonBorder": {
          "color": "#b99096",
          "alpha": 0.18
        },
        "buttonHoverStart": {
          "color": "#564048",
          "alpha": 0.98
        },
        "buttonHoverEnd": {
          "color": "#37272d",
          "alpha": 0.98
        },
        "buttonHoverBorder": {
          "color": "#d0b1b6",
          "alpha": 0.28
        },
        "buttonActiveStart": {
          "color": "#7f5a63",
          "alpha": 0.96
        },
        "buttonActiveEnd": {
          "color": "#65474f",
          "alpha": 0.96
        },
        "buttonActiveBorder": {
          "color": "#e1cfd2",
          "alpha": 0.44
        },
        "actionSafeBg": {
          "color": "#503941",
          "alpha": 0.92
        },
        "actionSafeIcon": {
          "color": "#f4ecee",
          "alpha": 0.98
        },
        "shellDivider": {
          "color": "#b99096",
          "alpha": 0.18
        },
        "text": {
          "color": "#f3edf0",
          "alpha": 1
        },
        "mutedText": {
          "color": "#cfbec4",
          "alpha": 0.84
        },
        "headerRule": {
          "color": "#c7a3aa",
          "alpha": 0.74
        },
        "icon": {
          "color": "#e4d9dd",
          "alpha": 0.96
        },
        "iconHover": {
          "color": "#fdf8f9",
          "alpha": 0.98
        },
        "iconActive": {
          "color": "#26191d",
          "alpha": 0.96
        }
      },
      "content": {
        "appBackground": {
          "color": "#161014",
          "alpha": 1
        },
        "surfaceStart": {
          "color": "#21191d",
          "alpha": 0.97
        },
        "surfaceEnd": {
          "color": "#171115",
          "alpha": 0.96
        },
        "container": {
          "color": "#2e2328",
          "alpha": 0.8
        },
        "card": {
          "color": "#3d3036",
          "alpha": 0.7
        },
        "cardHover": {
          "color": "#4a3a41",
          "alpha": 0.82
        },
        "formBackground": {
          "color": "#231b20",
          "alpha": 0.9
        },
        "divider": {
          "color": "#b99096",
          "alpha": 0.14
        },
        "scrollbar": {
          "color": "#9e7d84",
          "alpha": 0.4
        },
        "heading": {
          "color": "#f7f0f2",
          "alpha": 1
        },
        "subheading": {
          "color": "#c4abb1",
          "alpha": 0.95
        },
        "buttonHoverHeading": {
          "color": "#fff7f8",
          "alpha": 1
        },
        "label": {
          "color": "#ddcfd3",
          "alpha": 0.94
        },
        "text": {
          "color": "#ece2e5",
          "alpha": 1
        },
        "mutedText": {
          "color": "#bfafb4",
          "alpha": 0.84
        },
        "buttonHoverSubText": {
          "color": "#fbf0f2",
          "alpha": 0.95
        },
        "headerRule": {
          "color": "#c7a3aa",
          "alpha": 0.72
        },
        "horizontal2": {
          "color": "#c7a3aa",
          "alpha": 0.72
        },
        "border1": {
          "color": "#b99096",
          "alpha": 0.18
        },
        "border2": {
          "color": "#b99096",
          "alpha": 0.14
        },
        "border3": {
          "color": "#b99096",
          "alpha": 0.1
        },
        "actionGenericBg": {
          "color": "#49383f",
          "alpha": 0.92
        },
        "actionGenericText": {
          "color": "#fff5f6",
          "alpha": 1
        },
        "actionGenericBorder": {
          "color": "#b99096",
          "alpha": 0.18
        },
        "actionGenericBorderWidth": 1,
        "actionGenericRadius": 14
      },
      "theatre": {
        "gmBarBackground": {
          "color": "#241b20",
          "alpha": 0.92
        },
        "container1": {
          "color": "#241b20",
          "alpha": 0.92
        },
        "container1Border": {
          "color": "#b99096",
          "alpha": 0.18
        },
        "container1BorderWidth": 1,
        "container1Radius": 18,
        "container1BlurEnabled": true,
        "container2": {
          "color": "#34282d",
          "alpha": 0.86
        },
        "container2Border": {
          "color": "#b99096",
          "alpha": 0.14
        },
        "container2BorderWidth": 1,
        "container2Radius": 16,
        "container2BlurEnabled": true,
        "container3": {
          "color": "#43343b",
          "alpha": 0.9
        },
        "container3Border": {
          "color": "#b99096",
          "alpha": 0.16
        },
        "container3BorderWidth": 1,
        "container3Radius": 14,
        "container3BlurEnabled": false,
        "iconBackground": {
          "color": "#48363d",
          "alpha": 0.92
        },
        "iconBorder": {
          "color": "#b99096",
          "alpha": 0.16
        },
        "iconColor": {
          "color": "#f4ecee",
          "alpha": 0.98
        }
      },
      "stageGoblin": {
        "surface": {
          "color": "#241b20",
          "alpha": 0.84
        },
        "border": {
          "color": "#b99096",
          "alpha": 0.18
        },
        "icon": {
          "color": "#e4d9dd",
          "alpha": 0.96
        },
        "text": {
          "color": "#ece2e5",
          "alpha": 1
        },
        "iconSize": 0.92,
        "borderWidth": 1,
        "radius": 11,
        "fontPreset": "subText",
        "tagFontSize": 0.62,
        "tagHeight": 26,
        "tagWidth": 92,
        "tagRadius": 4,
        "tagPaddingX": 0.42,
        "tagGlowEnabled": true,
        "tagGlowBlur": 14
      }
    }
  }
];

export const POSITION_OPTIONS = ["left", "center", "right"];
