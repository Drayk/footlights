import { MODULE_ID } from "../constants.js";
import { applyThemeInlineStyleToHost, buildThemeInlineStyle } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";

export class TheatreAdventurePlannerConfigApplication extends FormApplication {
  constructor(options = {}) {
    super({}, options);
    this.plannerId = options.plannerId ?? null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-adventure-planner-config`,
      title: tr("Adventure Planner"),
      classes: [MODULE_ID, "theatre-adventure-planner-config"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-adventure-planner-config.hbs`,
      width: 460,
      height: 220,
      closeOnSubmit: true
    });
  }

  getData() {
    const planner = TheatreStore.getAdventurePlannerById(this.plannerId);
    return {
      themeInlineStyle: buildThemeInlineStyle(TheatreStore.getThemeState()),
      planner: planner ?? {
        id: this.plannerId,
        name: tr("New Adventure Planner")
      }
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    applyThemeInlineStyleToHost(this.form, TheatreStore.getThemeState());
  }

  async _updateObject(_event, formData) {
    const planner = this.plannerId ? TheatreStore.getAdventurePlannerById(this.plannerId) : null;
    await TheatreStore.upsertAdventurePlanner({
      id: this.plannerId || undefined,
      name: String(formData.name ?? "").trim() || planner?.name || tr("New Adventure Planner"),
      board: planner?.board,
      nodes: planner?.nodes,
      edges: planner?.edges
    });
  }
}
