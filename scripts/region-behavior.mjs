/**
 * The Region behavior "Map knowledge": when a token enters the Region, the players learn an area (this Region or
 * another one) or forget it. Runs on the active GM's client only, so a change is made once.
 */

import {BEHAVIOR_TYPE, ICON, players} from "./config.mjs";
import {blocker, changeShapes} from "./actions.mjs";
import {trace} from "./debug.mjs";
import {sharesFog} from "./fog.mjs";
import {trianglesShape} from "./shapes.mjs";

/** "Only once" behaviors that are switching themselves off right now, by UUID. */
const firing = new Set();

/** Who learns the area. */
export const AUDIENCES = {owners: "SMK.BEHAVIOR.audience.owners", everyone: "SMK.BEHAVIOR.audience.everyone"};

/**
 * The shapes of a Region: its triangulation, holes left out.
 * @param {RegionDocument} region
 * @returns {object[]}
 */
export function regionShapes(region) {
  const {vertices, indices} = region?.triangulation ?? {};
  const shape = trianglesShape(vertices, indices);
  return shape ? [shape] : [];
}

/**
 * Register the behavior type. Call in "init".
 */
export function registerBehavior() {
  const config = CONFIG.RegionBehavior;
  config.dataModels[BEHAVIOR_TYPE] = RevealBehaviorType;
  config.typeIcons[BEHAVIOR_TYPE] = ICON;
  // Foundry fills in "TYPES.RegionBehavior.<type>" only where nothing is set
  (config.typeLabels ??= {})[BEHAVIOR_TYPE] = "SMK.BEHAVIOR.label";
  (config.typeHints ??= {})[BEHAVIOR_TYPE] = "SMK.BEHAVIOR.hint";
}

export class RevealBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  /** @override */
  static LOCALIZATION_PREFIXES = ["SMK.BEHAVIOR", "BEHAVIOR.TYPES.base"];

  /** @override */
  static defineSchema() {
    const fields = foundry.data.fields;
    const E = CONST.REGION_EVENTS;
    return {
      events: this._createEventsField({events: [E.TOKEN_ENTER, E.TOKEN_MOVE_IN, E.TOKEN_TURN_START,
        E.TOKEN_ROUND_START], initial: [E.TOKEN_MOVE_IN]}),
      area: new fields.DocumentUUIDField({type: "Region", nullable: true, initial: null}),
      audience: new fields.StringField({required: true, blank: false, initial: "owners", choices: AUDIENCES}),
      hide: new fields.BooleanField({initial: false}),
      playersOnly: new fields.BooleanField({initial: true}),
      once: new fields.BooleanField({initial: true})
    };
  }

  /** @override */
  async _handleRegionEvent(event) {
    if ( !game.user.isActiveGM ) return;
    const token = event.data?.token;
    if ( !token ) return;
    const owners = players().filter(u => token.testUserPermission(u, "OWNER"));
    if ( this.playersOnly && !owners.length ) return;
    const scene = this.scene;
    const area = this.area ? fromUuidSync(this.area) : this.region;
    if ( !area || (area.parent !== scene) ) {
      console.warn(`sephrals-map-knowledge | The area of the behavior ${this.behavior.uuid} is not a Region of its scene`);
      return;
    }
    // The fog of the token's Level; an area that is not on that Level uses its own first Level
    let level = token.level ?? scene._view ?? scene.initialLevel?.id;
    if ( !area.includedInLevel(level) ) level = area.levels.first() ?? level;
    const users = (this.audience === "everyone") || sharesFog(scene) ? players().map(u => u.id)
      : owners.map(u => u.id);
    // A scene without fog exploration keeps the trigger for later
    if ( blocker(scene) ) return;
    if ( this.once ) {
      // Two tokens in the same moment: the second event comes before the switch-off is done
      const uuid = this.behavior.uuid;
      if ( firing.has(uuid) ) return;
      firing.add(uuid);
      try {
        await this.behavior.update({disabled: true});
      } finally {
        firing.delete(uuid);
      }
    }
    trace.add("region", {behavior: this.behavior.uuid, token: token.uuid, event: event.name, users});
    await changeShapes(regionShapes(area), {hide: this.hide, scene, level, users, kind: "region", quiet: true});
  }
}
