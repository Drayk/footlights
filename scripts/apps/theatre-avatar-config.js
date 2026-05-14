import { MODULE_ID } from "../constants.js";
import { applyThemeInlineStyleToHost, bindFootlightsToggleSwitches, buildThemeInlineStyle, openImagePickerForInput } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";

const AVATAR_CROP_OFFSET_BASE = 220;

function cropOffsetToPercent(value) {
  const offset = Math.max(-160, Math.min(160, Number(value) || 0));
  return `${((offset / AVATAR_CROP_OFFSET_BASE) * 100).toFixed(3)}%`;
}

export class TheatreAvatarConfigApplication extends FormApplication {
  constructor(options = {}) {
    super({}, options);
    this.avatarId = options.avatarId ?? null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-avatar-config`,
      title: tr("Footlights Avatar"),
      classes: [MODULE_ID, "theatre-avatar-config"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-avatar-config.hbs`,
      width: 1080,
      height: 780,
      closeOnSubmit: true
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    applyThemeInlineStyleToHost(this.form, TheatreStore.getThemeState());
    bindFootlightsToggleSwitches(html?.[0]);
    html.find("[data-action='pick-image']").on("click", this._onPickImage.bind(this));
    html.find("[name='defaultImage'], [name='frameImage'], [name='useCircularCrop'], [name='showBackdrop'], [name='circularCropScale'], [name='frameFitScale']").on("input change", this._onAvatarPreviewInput.bind(this));
    html.find("[data-avatar-preview-stack]").on("pointerdown", this._onAvatarPreviewCropPointerDown.bind(this));
    this._syncAvatarPreview();
  }

  _onPickImage(event) {
    event.preventDefault();
    openImagePickerForInput(this.form, event.currentTarget.dataset.target);
    window.setTimeout(() => this._syncAvatarPreview(), 0);
  }

  _onAvatarPreviewInput() {
    this._syncAvatarPreview();
  }

  _syncAvatarPreview() {
    if (!this.form) return;

    const defaultImage = this.form.querySelector("[name='defaultImage']")?.value?.trim?.() ?? "";
    const frameImage = this.form.querySelector("[name='frameImage']")?.value?.trim?.() ?? "";
    const useCircularCrop = Boolean(this.form.querySelector("[name='useCircularCrop']")?.checked);
    const showBackdrop = Boolean(this.form.querySelector("[name='showBackdrop']")?.checked);
    const circularCropScale = Math.max(0.7, Math.min(3, Number(this.form.querySelector("[name='circularCropScale']")?.value) || 1));
    const frameFitScale = Math.max(0.6, Math.min(1.2, Number(this.form.querySelector("[name='frameFitScale']")?.value) || 1));
    const cropOffsetX = Math.max(-160, Math.min(160, Number(this.form.querySelector("[name='cropOffsetX']")?.value) || 0));
    const cropOffsetY = Math.max(-160, Math.min(160, Number(this.form.querySelector("[name='cropOffsetY']")?.value) || 0));

    this.form.querySelectorAll("[data-avatar-preview-value-for]").forEach((element) => {
      const field = element.dataset.avatarPreviewValueFor;
      if (!field) return;
      const input = this.form.querySelector(`[name='${field}']`);
      if (!input) return;
      element.textContent = `${Number(input.value || 1).toFixed(2)}`;
    });

    const portrait = this.form.querySelector("[data-avatar-preview-portrait]");
    if (!portrait) return;

    portrait.classList.toggle("is-circular", useCircularCrop);
    portrait.classList.toggle("has-backdrop", showBackdrop && !useCircularCrop);
    portrait.style.setProperty("--tom-avatar-preview-crop-scale", String(circularCropScale));
    portrait.style.setProperty("--tom-avatar-preview-frame-fit-scale", String(frameFitScale));
    portrait.style.setProperty("--tom-avatar-preview-crop-offset-x", cropOffsetToPercent(cropOffsetX));
    portrait.style.setProperty("--tom-avatar-preview-crop-offset-y", cropOffsetToPercent(cropOffsetY));

    const stack = portrait.querySelector("[data-avatar-preview-stack]");
    let image = portrait.querySelector("[data-avatar-preview-image]");
    let placeholder = portrait.querySelector("[data-avatar-preview-placeholder]");
    if (defaultImage) {
      if (!image && stack) {
        image = document.createElement("img");
        image.className = "tom-avatar-preview-image";
        image.setAttribute("data-avatar-preview-image", "");
        image.alt = "";
        stack.appendChild(image);
      }
      if (image) image.setAttribute("src", defaultImage);
      placeholder?.remove();
    } else {
      image?.remove();
      image = null;
      if (!placeholder && stack) {
        placeholder = document.createElement("div");
        placeholder.className = "tom-avatar-preview-placeholder";
        placeholder.setAttribute("data-avatar-preview-placeholder", "");
        placeholder.textContent = tr("Avatar preview");
        stack.appendChild(placeholder);
      }
    }

    let frame = portrait.querySelector("[data-avatar-preview-frame]");
    if (frameImage) {
      if (!frame) {
        frame = document.createElement("img");
        frame.className = "tom-avatar-preview-frame";
        frame.setAttribute("data-avatar-preview-frame", "");
        frame.alt = "";
        portrait.appendChild(frame);
      }
      frame.setAttribute("src", frameImage);
    } else {
      frame?.remove();
    }
  }

  _onAvatarPreviewCropPointerDown(event) {
    if (!this.form) return;
    const portrait = this.form.querySelector("[data-avatar-preview-portrait]");
    if (!portrait?.classList?.contains("is-circular")) return;
    const offsetXInput = this.form.querySelector("[name='cropOffsetX']");
    const offsetYInput = this.form.querySelector("[name='cropOffsetY']");
    if (!offsetXInput || !offsetYInput) return;

    event.preventDefault();
    const stack = event.currentTarget;
    stack.classList.add("is-dragging");
    stack.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = Number(offsetXInput.value) || 0;
    const initialY = Number(offsetYInput.value) || 0;
    const rect = portrait.getBoundingClientRect();
    const offsetUnitsPerPixelX = AVATAR_CROP_OFFSET_BASE / Math.max(1, rect.width);
    const offsetUnitsPerPixelY = AVATAR_CROP_OFFSET_BASE / Math.max(1, rect.height);
    let pendingX = initialX;
    let pendingY = initialY;
    let frameRequest = null;

    const applyCropOffset = () => {
      frameRequest = null;
      offsetXInput.value = pendingX.toFixed(0);
      offsetYInput.value = pendingY.toFixed(0);
      portrait.style.setProperty("--tom-avatar-preview-crop-offset-x", cropOffsetToPercent(pendingX));
      portrait.style.setProperty("--tom-avatar-preview-crop-offset-y", cropOffsetToPercent(pendingY));
    };

    const onMove = (moveEvent) => {
      pendingX = Math.max(-160, Math.min(160, initialX + ((moveEvent.clientX - startX) * offsetUnitsPerPixelX)));
      pendingY = Math.max(-160, Math.min(160, initialY + ((moveEvent.clientY - startY) * offsetUnitsPerPixelY)));
      if (!frameRequest) frameRequest = window.requestAnimationFrame(applyCropOffset);
    };

    const onUp = (upEvent) => {
      if (frameRequest) {
        window.cancelAnimationFrame(frameRequest);
        applyCropOffset();
      }
      stack.classList.remove("is-dragging");
      stack.releasePointerCapture?.(upEvent.pointerId);
      stack.removeEventListener("pointermove", onMove);
      stack.removeEventListener("pointerup", onUp);
      stack.removeEventListener("pointercancel", onUp);
      this._syncAvatarPreview();
    };

    stack.addEventListener("pointermove", onMove);
    stack.addEventListener("pointerup", onUp);
    stack.addEventListener("pointercancel", onUp);
  }

  getData() {
    const avatar = this.avatarId ? TheatreStore.getAvatarById(this.avatarId) : null;
    const moodPresets = TheatreStore.getMoodPresets();
    const themeState = TheatreStore.getThemeState();
    const actorOptions = (game.actors?.contents ?? []).map((actor) => ({
      value: actor.id,
      label: actor.name
    }));

    return {
      themeInlineStyle: buildThemeInlineStyle(themeState),
      avatar: avatar ?? {
        id: "",
        name: "",
        actorId: "",
        defaultImage: "",
        moodImages: {},
        useCircularCrop: false,
        circularCropScale: 1,
        cropOffsetX: 0,
        cropOffsetY: 0,
        frameFitScale: 1,
        frameImage: "",
        showBackdrop: true
      },
      actorOptions,
      moodPresets
    };
  }

  async _updateObject(_event, formData) {
    const expanded = foundry.utils.expandObject(formData);
    const moodImages = expanded.moodImages && typeof expanded.moodImages === "object"
      ? expanded.moodImages
      : {};

    await TheatreStore.upsertAvatar({
      id: expanded.id || this.avatarId,
      name: expanded.name,
      actorId: expanded.actorId,
      defaultImage: expanded.defaultImage,
      useCircularCrop: Boolean(expanded.useCircularCrop),
      circularCropScale: Math.max(0.7, Math.min(3, Number(expanded.circularCropScale) || 1)),
      cropOffsetX: Math.max(-160, Math.min(160, Number(expanded.cropOffsetX) || 0)),
      cropOffsetY: Math.max(-160, Math.min(160, Number(expanded.cropOffsetY) || 0)),
      frameFitScale: Math.max(0.6, Math.min(1.2, Number(expanded.frameFitScale) || 1)),
      frameImage: expanded.frameImage,
      showBackdrop: Boolean(expanded.showBackdrop),
      moodImages
    });

    for (const app of Object.values(ui.windows ?? {})) {
      if ([
        "TheatreSceneLibraryApplication",
        "TheatreSceneConfigApplication"
      ].includes(app.constructor?.name)) {
        app.render(false);
      }
    }
    await game.modules.get(MODULE_ID)?.api?.manager?.onSettingsChanged?.();

    ui.notifications?.info(tr("Footlights avatar saved."));
  }
}
