// Sanctoria Automation - Warren-Skin Cloak v0.7.0
// Foundry VTT v14 / dnd5e 5.3.x
//
// Current automation:
// - Refuse the First Fall
// - Predator's Memory
// - Gnawing Persistence
// - Shared Endurance reminder
// - Hold the Line
//
// Predator's Memory v0.5.4:
// Debug confirmed initiative timing:
//   1. preUpdateCombatant
//   2. updateCombatant
//   3. preCreateChatMessage
//   4. createChatMessage
//
// This version applies the advantage result in preUpdateCombatant, stores that roll,
// then rewrites the following normal initiative chat card so card and tracker match.

const SANCTORIA_WSC_ITEM_KEY = "warren-skin-cloak";
const SANCTORIA_WSC_FLAG_SCOPE = "sanctoria-automation";
const SANCTORIA_WSC_REFUSE_ACTIVITY = "Refuse the First Fall";
const SANCTORIA_WSC_HOLD_ACTIVITY = "Hold the Line";
const SANCTORIA_WSC_LAW_ACTIVITY = "Law of the Warren";
const SANCTORIA_WSC_DEBUG = false;

const sanctoriaWscPreHp = new Map();
const sanctoriaWscPendingInitiativeCards = new Map();

Hooks.once("ready", () => {
  console.log("Sanctoria Automation | Warren-Skin Cloak v0.7.0 registered");
});

// ------------------------------------------------------------
// Predator's Memory
// ------------------------------------------------------------

Hooks.on("preUpdateCombatant", async (combatant, changed, options, userId) => {
  try {
    if (!game.user?.isGM) return;
    if (!foundry.utils.hasProperty(changed, "initiative")) return;

    const actor = combatant.actor;
    if (!actor) return;
    if (!sanctoriaActorQualifiesForPredatorsMemory(actor)) return;

    const originalInitiative = Number(changed.initiative);
    const advantageRoll = await sanctoriaRollPredatorsMemoryInitiative(actor);
    if (!advantageRoll) return;

    changed.initiative = advantageRoll.total;

    const pending = {
      actorUuid: actor.uuid,
      actorId: actor.id,
      tokenId: combatant.tokenId ?? combatant.token?.id ?? null,
      combatantId: combatant.id,
      combatId: combatant.combat?.id ?? null,
      rollJson: advantageRoll.toJSON(),
      total: advantageRoll.total,
      formula: advantageRoll.formula,
      originalInitiative,
      created: Date.now()
    };

    sanctoriaWscPendingInitiativeCards.set(actor.uuid, pending);
    if (pending.tokenId) sanctoriaWscPendingInitiativeCards.set(`token.${pending.tokenId}`, pending);
    if (pending.combatantId) sanctoriaWscPendingInitiativeCards.set(`combatant.${pending.combatantId}`, pending);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sanctoria-card warren-skin-cloak"><h2>Warren-Skin Cloak</h2><h3>Predator's Memory</h3><p>The cloak remembers every wound.</p><p><strong>${actor.name}</strong> begins combat injured and rolls initiative with advantage.</p></div>`
    });

    if (SANCTORIA_WSC_DEBUG) {
      console.log("Sanctoria WSC | Predator's Memory applied in preUpdateCombatant", pending);
    }
  } catch (err) {
    console.error("Sanctoria Automation | Warren-Skin Cloak Predator's Memory preUpdateCombatant error:", err);
  }
});

Hooks.on("preCreateChatMessage", (message, data, options, userId) => {
  try {
    if (!message?.rolls?.length) return;

    const flavor = String(message.flavor ?? data?.flavor ?? "");
    if (!/rolls for Initiative/i.test(flavor)) return;
    if (/Predator'?s Memory/i.test(flavor)) return;

    const speaker = message.speaker ?? data?.speaker;
    const actor = sanctoriaGetActorFromSpeaker(speaker);

    let pending = null;
    if (actor?.uuid) pending = sanctoriaWscPendingInitiativeCards.get(actor.uuid);
    if (!pending && speaker?.token) pending = sanctoriaWscPendingInitiativeCards.get(`token.${speaker.token}`);

    if (!pending) return;

    if (Date.now() - Number(pending.created ?? 0) > 10000) {
      sanctoriaClearPendingInitiative(pending);
      return;
    }

    const actorName = actor?.name ?? speaker?.alias ?? "Creature";
    const newFlavor = `${actorName} rolls for Initiative! <em>(Warren-Skin Cloak: Predator's Memory)</em>`;

    message.updateSource({
      rolls: [pending.rollJson],
      flavor: newFlavor
    });

    if (data) {
      data.rolls = [pending.rollJson];
      data.flavor = newFlavor;
    }

    sanctoriaClearPendingInitiative(pending);

    if (SANCTORIA_WSC_DEBUG) {
      console.log("Sanctoria WSC | Predator's Memory replaced initiative chat card", {
        actor: actorName,
        total: pending.total,
        formula: pending.formula
      });
    }
  } catch (err) {
    console.error("Sanctoria Automation | Warren-Skin Cloak Predator's Memory preCreateChatMessage error:", err);
  }
});

function sanctoriaClearPendingInitiative(pending) {
  if (!pending) return;
  if (pending.actorUuid) sanctoriaWscPendingInitiativeCards.delete(pending.actorUuid);
  if (pending.tokenId) sanctoriaWscPendingInitiativeCards.delete(`token.${pending.tokenId}`);
  if (pending.combatantId) sanctoriaWscPendingInitiativeCards.delete(`combatant.${pending.combatantId}`);
}

Hooks.on("deleteCombat", () => {
  sanctoriaWscPendingInitiativeCards.clear();
});

function sanctoriaActorQualifiesForPredatorsMemory(actor) {
  const cloak = sanctoriaFindWarrenSkinCloak(actor);
  if (!cloak || !sanctoriaIsEquippedAndAttuned(cloak)) return false;

  const hp = actor.system?.attributes?.hp;
  const currentHp = Number(hp?.value ?? 0);
  const maxHp = Number(hp?.max ?? 0);

  if (!Number.isFinite(currentHp) || !Number.isFinite(maxHp) || maxHp <= 0) return false;
  if (currentHp <= 0) return false;
  if (currentHp >= maxHp) return false;

  return true;
}

async function sanctoriaRollPredatorsMemoryInitiative(actor) {
  const rollData = actor.getRollData ? actor.getRollData() : actor.system ?? {};

  const initTotal = Number(actor.system?.attributes?.init?.total);
  const initMod = Number(actor.system?.attributes?.init?.mod);
  const initBonusRaw = actor.system?.attributes?.init?.bonus ?? "";

  let formula;

  if (Number.isFinite(initTotal)) {
    formula = "2d20kh + @attributes.init.total";
  } else if (Number.isFinite(initMod)) {
    formula = "2d20kh + @attributes.init.mod";
  } else {
    const bonus = String(initBonusRaw ?? "").trim();
    formula = "2d20kh + @abilities.dex.mod";
    if (bonus) formula += ` + (${bonus})`;
  }

  try {
    const roll = new Roll(formula, rollData);
    await roll.evaluate();
    return roll;
  } catch (err) {
    console.warn("Sanctoria Automation | Predator's Memory initiative formula failed, using Dex fallback.", { formula, err });
    const fallback = new Roll("2d20kh + @abilities.dex.mod", rollData);
    await fallback.evaluate();
    return fallback;
  }
}

function sanctoriaGetActorFromSpeaker(speaker) {
  if (!speaker) return null;

  if (speaker.token && canvas?.tokens) {
    const token = canvas.tokens.get(speaker.token);
    if (token?.actor) return token.actor;
  }

  if (speaker.actor) {
    const actor = game.actors?.get(speaker.actor);
    if (actor) return actor;
  }

  return null;
}



// ------------------------------------------------------------
// Gnawing Persistence
// ------------------------------------------------------------
Hooks.on("updateCombat", async (combat, changed) => {
 try {
  if (!game.user?.isGM) return;
  if (!("turn" in changed) && !("round" in changed)) return;
  const actor = combat.combatant?.actor;
  if (!actor) return;
  const cloak = sanctoriaFindWarrenSkinCloak(actor);
  if (!cloak || !sanctoriaIsEquippedAndAttuned(cloak)) return;
  if (sanctoriaGetActorLevel(actor) < 8) return;
  const hp = Number(actor.system?.attributes?.hp?.value ?? 0);
  const maxHp = Number(actor.system?.attributes?.hp?.max ?? 0);
  if (maxHp <= 0 || hp > Math.floor(maxHp/2)) return;

  const found = sanctoriaFindActivityByName(cloak, "Gnawing Persistence");
  if (!found) return;
  const [activityId, activity] = found;
  const maxUses = Number(activity?.uses?.max ?? activity?.system?.uses?.max ?? 0);
  const spent = Number(activity?.uses?.spent ?? activity?.system?.uses?.spent ?? 0);
  if (maxUses > 0 && spent >= maxUses) return;

  const heal = Number(actor.system?.attributes?.prof ?? actor.system?.attributes?.prof?.value ?? 0);
  const current = Number(actor.system?.attributes?.hp?.value ?? 0);

  await actor.update({"system.attributes.hp.value": Math.min(maxHp, current + heal)});
  await sanctoriaConsumeActivityUse(cloak, activityId, activity);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sanctoria-card warren-skin-cloak"><h2>Warren-Skin Cloak</h2><h3>Gnawing Persistence</h3><p>The cloak refuses to let its bearer falter.</p><p>You regain <strong>${heal}</strong> hit points.</p></div>`
  });
 } catch(err) { console.error("Gnawing Persistence error", err); }
});


// ------------------------------------------------------------
// Shared Endurance
// ------------------------------------------------------------
Hooks.on("createChatMessage", async (message, options, userId) => {
 try {
  if (!game.user?.isGM) return;

  const content = String(message.content ?? "");
  const flavor = String(message.flavor ?? "");
  const isSurvivorsReflex = /Survivor.?s Reflex/i.test(content) || /Survivor.?s Reflex/i.test(flavor);
  if (!isSurvivorsReflex) return;
  if (/Shared Endurance/i.test(content) || /Shared Endurance/i.test(flavor)) return;

  const actor = sanctoriaGetActorFromSpeaker(message.speaker);
  if (!actor) return;

  const cloak = sanctoriaFindWarrenSkinCloak(actor);
  if (!cloak || !sanctoriaIsEquippedAndAttuned(cloak)) return;
  if (sanctoriaGetActorLevel(actor) < 12) return;

  const pb = Number(actor.system?.attributes?.prof ?? actor.system?.attributes?.prof?.value ?? 0);
  if (!Number.isFinite(pb) || pb <= 0) return;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sanctoria-card warren-skin-cloak"><h2>Warren-Skin Cloak</h2><h3>Shared Endurance</h3><p>The cloak's resilience extends beyond <strong>${actor.name}</strong>.</p><p>Choose one conscious ally within <strong>10 feet</strong>.</p><p>That ally gains <strong>${pb}</strong> temporary hit points.</p><p><em>Apply this manually to the chosen ally.</em></p></div>`
  });
 } catch(err) { console.error("Shared Endurance error", err); }
});



function sanctoriaHasConsciousAllyWithin(actor, distanceFeet) {
  try {
    const sourceToken = actor.getActiveTokens?.()[0];
    if (!sourceToken) return false;

    const sourceDisposition = sourceToken.document?.disposition;
    if (sourceDisposition === undefined || sourceDisposition === null) return false;

    for (const token of canvas.tokens.placeables) {
      if (!token || token === sourceToken) continue;
      if (!token.actor) continue;
      if (token.document?.hidden) continue;
      if (token.document?.disposition !== sourceDisposition) continue;

      const hp = token.actor.system?.attributes?.hp;
      const currentHp = Number(hp?.value ?? 0);
      if (!Number.isFinite(currentHp) || currentHp <= 0) continue;

      const effectNames = Array.from(token.actor.effects ?? [])
        .map(e => String(e.name ?? e.label ?? "").toLowerCase());
      if (effectNames.includes("dead") || effectNames.includes("unconscious")) continue;

      const distance = sanctoriaMeasureTokenDistanceFeet(sourceToken, token);
      if (Number.isFinite(distance) && distance <= distanceFeet) return true;
    }

    return false;
  } catch (err) {
    console.error("Sanctoria Automation | Warren-Skin Cloak ally check error:", err);
    return false;
  }
}

function sanctoriaMeasureTokenDistanceFeet(sourceToken, targetToken) {
  try {
    if (canvas.grid?.measurePath) {
      const result = canvas.grid.measurePath([sourceToken.center, targetToken.center]);
      const distance = Number(result?.distance);
      if (Number.isFinite(distance)) return distance;
    }

    if (canvas.grid?.measureDistances) {
      const ray = new Ray(sourceToken.center, targetToken.center);
      const distances = canvas.grid.measureDistances([{ ray }], { gridSpaces: true });
      const distance = Number(distances?.[0]);
      if (Number.isFinite(distance)) return distance;
    }

    const dx = sourceToken.center.x - targetToken.center.x;
    const dy = sourceToken.center.y - targetToken.center.y;
    const pixels = Math.hypot(dx, dy);
    const size = Number(canvas.grid?.size ?? 100);
    const gridDistance = Number(canvas.scene?.grid?.distance ?? 5);

    if (size > 0 && Number.isFinite(gridDistance)) return (pixels / size) * gridDistance;
    return Infinity;
  } catch (err) {
    console.error("Sanctoria Automation | Warren-Skin Cloak distance check error:", err);
    return Infinity;
  }
}

// ------------------------------------------------------------
// Refuse the First Fall
// ------------------------------------------------------------

Hooks.on("preUpdateActor", (actor, changed, options, userId) => {
  const newHp = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (newHp === undefined) return;

  sanctoriaWscPreHp.set(actor.uuid, {
    hp: Number(actor.system?.attributes?.hp?.value ?? 0),
    temp: Number(actor.system?.attributes?.hp?.temp ?? 0),
    max: Number(actor.system?.attributes?.hp?.max ?? 0)
  });
});

Hooks.on("updateActor", async (actor, changed, options, userId) => {
  try {
    const newHpRaw = foundry.utils.getProperty(changed, "system.attributes.hp.value");
    if (newHpRaw === undefined) return;

    const before = sanctoriaWscPreHp.get(actor.uuid);
    sanctoriaWscPreHp.delete(actor.uuid);
    if (!before) return;

    const oldHp = Number(before.hp ?? 0);
    const newHp = Number(actor.system?.attributes?.hp?.value ?? 0);
    const maxHp = Number(actor.system?.attributes?.hp?.max ?? 0);

    if (!Number.isFinite(oldHp) || !Number.isFinite(newHp) || !Number.isFinite(maxHp) || maxHp <= 0) return;
    if (newHp >= oldHp) return;

    const cloak = sanctoriaFindWarrenSkinCloak(actor);
    if (!cloak) return;
    if (!sanctoriaIsEquippedAndAttuned(cloak)) return;

    // ------------------------------------------------------------
    // Law of the Warren
    // ------------------------------------------------------------
    //
    // Level 20+ capstone.
    // While at least one conscious ally with the same token disposition is within 30 feet,
    // damage cannot reduce the wearer below 1 HP.
    //
    // This takes priority over Hold the Line so the Level 16 use is not consumed while the
    // Level 20 capstone condition is satisfied.
    if (newHp <= 0 && oldHp > 0 && sanctoriaGetActorLevel(actor) >= 20) {
      const lawEntry = sanctoriaFindActivityByName(cloak, SANCTORIA_WSC_LAW_ACTIVITY);
      const hasAlly = sanctoriaHasConsciousAllyWithin(actor, 30);

      if (lawEntry && hasAlly) {
        await actor.update({ "system.attributes.hp.value": 1 });

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
            <div class="sanctoria-card warren-skin-cloak">
              <h2>Warren-Skin Cloak</h2>
              <h3>Law of the Warren</h3>
              <p>The Warren closes ranks around <strong>${actor.name}</strong>.</p>
              <p>Because a conscious ally stands within <strong>30 feet</strong>, damage cannot reduce <strong>${actor.name}</strong> below <strong>1 hit point</strong>.</p>
            </div>
          `
        });

        return;
      }
    }

    // ------------------------------------------------------------
    // Hold the Line
    // ------------------------------------------------------------
    //
    // Level 16+.
    // Once per long rest. When the wearer would be reduced to 0 HP but not killed outright,
    // set HP to 1 and grant temporary HP equal to twice PB.
    //
    // This takes priority over Refuse the First Fall for the same damage event so a single
    // drop-to-0 hit does not consume both features.
    if (newHp <= 0 && oldHp > 0 && sanctoriaGetActorLevel(actor) >= 16) {
      const holdEntry = sanctoriaFindActivityByName(cloak, SANCTORIA_WSC_HOLD_ACTIVITY);
      if (holdEntry) {
        const [holdActivityId, holdActivity] = holdEntry;
        const holdMaxUses = Number(holdActivity?.uses?.max ?? holdActivity?.system?.uses?.max ?? 0);
        const holdSpent = Number(holdActivity?.uses?.spent ?? holdActivity?.system?.uses?.spent ?? 0);

        if (!(holdMaxUses > 0 && holdSpent >= holdMaxUses)) {
          const pb = Number(actor.system?.attributes?.prof ?? actor.system?.attributes?.prof?.value ?? 0);
          if (Number.isFinite(pb) && pb > 0) {
            const tempHp = pb * 2;
            const currentTemp = Number(actor.system?.attributes?.hp?.temp ?? 0);
            const finalTemp = Math.max(currentTemp, tempHp);

            await actor.update({
              "system.attributes.hp.value": 1,
              "system.attributes.hp.temp": finalTemp
            });

            await sanctoriaConsumeActivityUse(cloak, holdActivityId, holdActivity);

            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `
                <div class="sanctoria-card warren-skin-cloak">
                  <h2>Warren-Skin Cloak</h2>
                  <h3>Hold the Line</h3>
                  <p>The cloak locks around <strong>${actor.name}</strong>, refusing the final fall.</p>
                  <p><strong>${actor.name}</strong> drops to <strong>1 hit point</strong> instead and gains <strong>${tempHp}</strong> temporary hit points.</p>
                  <p><em>Until the end of ${actor.name}'s next turn, their speed is 0.</em></p>
                </div>
              `
            });

            return;
          }
        }
      }
    }

    const halfHp = Math.floor(maxHp / 2);

    if (oldHp <= halfHp) return;
    if (newHp > halfHp) return;

    const activityEntry = sanctoriaFindActivityByName(cloak, SANCTORIA_WSC_REFUSE_ACTIVITY);
    if (!activityEntry) {
      console.warn("Sanctoria Automation | Warren-Skin Cloak: Refuse the First Fall activity not found.", cloak);
      return;
    }

    const [activityId, activity] = activityEntry;
    const maxUses = Number(activity?.uses?.max ?? activity?.system?.uses?.max ?? 0);
    const spent = Number(activity?.uses?.spent ?? activity?.system?.uses?.spent ?? 0);

    if (maxUses > 0 && spent >= maxUses) return;

    const tempHp = sanctoriaGetRefuseFirstFallTempHp(actor);
    if (tempHp <= 0) return;

    const currentTemp = Number(actor.system?.attributes?.hp?.temp ?? 0);
    const finalTemp = Math.max(currentTemp, tempHp);

    await actor.update({ "system.attributes.hp.temp": finalTemp });
    await sanctoriaConsumeActivityUse(cloak, activityId, activity);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="sanctoria-card warren-skin-cloak">
          <h2>Warren-Skin Cloak</h2>
          <h3>Refuse the First Fall</h3>
          <p>The cloak tightens around <strong>${actor.name}</strong>, refusing to surrender the fight.</p>
          <p><strong>${actor.name}</strong> gains <strong>${tempHp}</strong> temporary hit points.</p>
          ${currentTemp > tempHp ? `<p><em>Existing temporary hit points were higher, so they were not replaced.</em></p>` : ""}
        </div>
      `
    });
  } catch (err) {
    console.error("Sanctoria Automation | Warren-Skin Cloak error:", err);
  }
});

// ------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------

function sanctoriaFindWarrenSkinCloak(actor) {
  return actor.items.find(item => {
    const key = item.flags?.[SANCTORIA_WSC_FLAG_SCOPE]?.itemKey;
    const identifier = item.system?.identifier;
    return key === SANCTORIA_WSC_ITEM_KEY || identifier === SANCTORIA_WSC_ITEM_KEY || item.name === "Warren-Skin Cloak";
  });
}

function sanctoriaIsEquippedAndAttuned(item) {
  const equipped = item.system?.equipped === true;
  const attuned = item.system?.attuned === true;
  const requiresAttunement = item.system?.attunement === "required";
  return equipped && (!requiresAttunement || attuned);
}

function sanctoriaFindActivityByName(item, activityName) {
  const activities = item.system?.activities;
  if (!activities) return null;

  if (typeof activities.find === "function") {
    const activity = activities.find(a => a?.name === activityName);
    if (activity) return [activity.id ?? activity._id, activity];
  }

  if (Array.isArray(activities.contents)) {
    const activity = activities.contents.find(a => a?.name === activityName);
    if (activity) return [activity.id ?? activity._id, activity];
  }

  if (typeof activities[Symbol.iterator] === "function") {
    for (const activity of activities) {
      if (activity?.name === activityName) return [activity.id ?? activity._id, activity];
      if (Array.isArray(activity) && activity[1]?.name === activityName) return [activity[0], activity[1]];
    }
  }

  if (typeof activities === "object") {
    for (const [id, activity] of Object.entries(activities)) {
      if (activity?.name === activityName) return [id, activity];
    }
  }

  return null;
}

async function sanctoriaConsumeActivityUse(item, activityId, activity) {
  const spent = Number(activity?.uses?.spent ?? activity?.system?.uses?.spent ?? 0);
  if (!activityId) {
    console.warn("Sanctoria Automation | Warren-Skin Cloak: missing activity ID; cannot consume use.", activity);
    return;
  }
  await item.update({ [`system.activities.${activityId}.uses.spent`]: spent + 1 });
}

function sanctoriaGetRefuseFirstFallTempHp(actor) {
  const level = sanctoriaGetActorLevel(actor);
  const pb = Number(actor.system?.attributes?.prof ?? actor.system?.attributes?.prof?.value ?? 0);

  if (!Number.isFinite(pb) || pb <= 0) return 0;

  if (level >= 8) return pb * 2;
  return pb;
}

function sanctoriaGetActorLevel(actor) {
  const detailsLevel = Number(actor.system?.details?.level ?? 0);
  if (Number.isFinite(detailsLevel) && detailsLevel > 0) return detailsLevel;

  const classLevels = actor.items
    ?.filter(i => i.type === "class")
    ?.reduce((sum, cls) => sum + Number(cls.system?.levels ?? 0), 0);

  if (Number.isFinite(classLevels) && classLevels > 0) return classLevels;

  const cr = Number(actor.system?.details?.cr ?? 0);
  if (Number.isFinite(cr) && cr > 0) return cr;

  return 1;
}
