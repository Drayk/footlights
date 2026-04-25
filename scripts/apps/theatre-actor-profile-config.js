import { MODULE_ID } from "../constants.js";
import { applyThemeInlineStyleToHost, buildThemeInlineStyle, openImagePickerForInput, safeJsonParse } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";

export class TheatreActorProfileConfigApplication extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this.actor = actor;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-actor-profile-config`,
      title: tr("Footlights Actor Profile"),
      classes: [MODULE_ID, "theatre-actor-profile-config"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-actor-profile-config.hbs`,
      width: 640,
      height: 520,
      closeOnSubmit: true
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    applyThemeInlineStyleToHost(this.form, TheatreStore.getThemeState());
    html.find("[data-action='pick-image']").on("click", this._onPickImage.bind(this));
  }

  _onPickImage(event) {
    event.preventDefault();
    openImagePickerForInput(this.form, event.currentTarget.dataset.target);
  }

  getData() {
    const profile = TheatreStore.getProfileByActorId(this.actor.id);
    const themeState = TheatreStore.getThemeState();

    return {
      themeInlineStyle: buildThemeInlineStyle(themeState),
      actor: this.actor,
      profile: profile ?? {
        actorId: this.actor.id,
        defaultImage: this.actor.img,
        moods: {
          neutral: this.actor.img
        }
      },
      moodsJson: JSON.stringify(profile?.moods ?? { neutral: this.actor.img }, null, 2)
    };
  }

  async _updateObject(_event, formData) {
    const expanded = foundry.utils.expandObject(formData);

    let moods;
    try {
      moods = safeJsonParse(expanded.moodsJson, {}, tr("Moods"));
    } catch (error) {
      ui.notifications?.error(error.message);
      return;
    }

    if (!moods || Array.isArray(moods) || typeof moods !== "object") {
      ui.notifications?.error(tr("Moods must be stored as an object."));
      return;
    }

    await TheatreStore.upsertProfile({
      actorId: this.actor.id,
      defaultImage: expanded.defaultImage,
      moods
    });

    ui.notifications?.info(tr("Saved Footlights profile for {name}.", { name: this.actor.name }));
  }
}
