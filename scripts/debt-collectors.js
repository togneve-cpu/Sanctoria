// Sanctoria Automation - Debt Collectors
// Foundry V14 / dnd5e 5.3.x / Midi-QOL 14.x / DAE 14.x
// v0.2.0
// Adds: Cornered Animal, Crushing Advance, Impact Tremor L16 success rider, Debtor's Panic foundation.

Hooks.once("ready", () => {
  const MODULE = "Sanctoria Automation: Debt Collectors v0.3.0";
  const ITEM_NAME = "The Debt Collectors";
  const FLAG_SCOPE = "sanctoria-automation";
  const FLAGS = { bullyShoveUsed: "bullyShoveUsed",
    breakTheLinePrime: "breakTheLinePrime",
    skipBullyShoveThisHit: "skipBullyShoveThisHit",
    collectionDayUsed: "collectionDayUsed",
    finalNoticeUsed: "finalNoticeUsed",
    collectionDayActive: "collectionDayActive"};
  const UNARMED_NAMES = ["Unarmed Strike", "Unarmed attack", "Unarmed"];

  if (globalThis.__SanctoriaDebtCollectorsRegistered) {
    console.warn(`${MODULE}: already registered.`);
    return;
  }
  globalThis.__SanctoriaDebtCollectorsRegistered = true;

  const isUnarmedItem = item => !!item?.name && UNARMED_NAMES.some(n => item.name.toLowerCase() === n.toLowerCase());

  function getDebtCollectors(actor) {
    return actor?.items?.find(i => i.name === ITEM_NAME && i.system?.equipped === true && i.system?.attuned === true);
  }

  const getLevel = actor => Number(actor?.system?.details?.level ?? actor?.system?.details?.cr ?? 1);

  function getDamageFormula(actor) {
    const level = getLevel(actor);
    if (level >= 12) return "2 + 2d6[bludgeoning]";
    if (level >= 8) return "2 + 1d6[bludgeoning]";
    return "1 + 1d4[bludgeoning]";
  }

  function getSaveDC(actor) {
    return 8 + Number(actor.system?.attributes?.prof ?? 0) + Number(actor.system?.abilities?.str?.mod ?? 0);
  }

  const getTargetAC = token => Number(token?.actor?.system?.attributes?.ac?.value ?? 10);

  function getAbilitySaveBonus(actor, ability) {
    const rd = actor.getRollData?.() ?? {};
    const sys = actor.system ?? {};
    const candidates = [
      rd.abilities?.[ability]?.save?.value,
      rd.abilities?.[ability]?.save,
      rd.abilities?.[ability]?.mod,
      sys.abilities?.[ability]?.save?.value,
      sys.abilities?.[ability]?.save,
      sys.abilities?.[ability]?.mod,
      0
    ];
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c)) return c;
      if (typeof c === "string" && c.trim() !== "" && !Number.isNaN(Number(c))) return Number(c);
      if (c && typeof c === "object") {
        for (const k of ["value", "total", "mod", "bonus"]) {
          const v = c[k];
          if (typeof v === "number" && Number.isFinite(v)) return v;
          if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
        }
      }
    }
    return 0;
  }

  function hasAnyStatus(actor, statuses) {
    for (const e of actor?.effects ?? []) {
      const st = Array.from(e.statuses ?? []).map(s => String(s).toLowerCase());
      if (st.some(s => statuses.includes(s))) return true;
      if (statuses.includes(String(e.name ?? "").toLowerCase())) return true;
    }
    return false;
  }

  function getTokenForActor(actor) {
    return canvas.tokens?.placeables?.find(t => t.actor?.id === actor?.id);
  }

  async function rollSave(targetActor, ability, dc, disadvantage = false, reason = "") {
    const saveBonus = getAbilitySaveBonus(targetActor, ability);
    const formula = disadvantage ? `2d20kl + ${saveBonus}` : `1d20 + ${saveBonus}`;
    const roll = await new Roll(formula).evaluate();

    const reasonText = reason ? `<br><em>${reason}</em>` : "";
    const disadvantageText = disadvantage ? " <strong>(disadvantage)</strong>" : "";

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: targetActor }),
      flavor: `<strong>${ITEM_NAME}: ${ability.toUpperCase()} save vs DC ${dc}</strong>${disadvantageText}${reasonText}`
    });

    return roll.total;
  }

  async function applyNativeStatus(token, status) {
    const actor = token.actor;
    if (!actor) return;
    if (actor.toggleStatusEffect) {
      await actor.toggleStatusEffect(status, { active: true });
      return;
    }
    const cfg = (CONFIG.statusEffects ?? []).find(s => s.id === status);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `${ITEM_NAME}: ${status}`,
      icon: cfg?.img ?? `icons/svg/${status}.svg`,
      statuses: [status],
      duration: { rounds: 1, turns: 0, startRound: game.combat?.round ?? null, startTurn: game.combat?.turn ?? null },
      flags: { dae: { stackable: "noneName", specialDuration: [] }, "debt-collectors": { source: ITEM_NAME, removable: true } }
    }]);
  }

  async function applyNoReactions(token, label = "No Reactions") {
    await applyNativeStatus(token, "surprised");
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: token.actor }),
      content: `<strong>${ITEM_NAME}: ${label}</strong><br>${token.name} cannot take reactions until the start of the attacker's next turn.`
    });
  }

  async function applySpeedZero(targetToken, sourceActor) {
    const actor = targetToken.actor;
    if (!actor) return;
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `${ITEM_NAME}: Cornered Animal - Speed 0`,
      icon: "icons/svg/anchor.svg",
      origin: sourceActor?.uuid ?? null,
      duration: { rounds: 1, turns: 0, startRound: game.combat?.round ?? null, startTurn: game.combat?.turn ?? null },
      changes: [
        { key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: 0, priority: 20 },
        { key: "system.attributes.movement.fly", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: 0, priority: 20 },
        { key: "system.attributes.movement.swim", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: 0, priority: 20 },
        { key: "system.attributes.movement.climb", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: 0, priority: 20 },
        { key: "system.attributes.movement.burrow", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: 0, priority: 20 }
      ],
      flags: { dae: { stackable: "noneName", specialDuration: [] }, "debt-collectors": { source: ITEM_NAME, feature: "Cornered Animal" } }
    }]);
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      content: `<strong>${ITEM_NAME}: Cornered Animal</strong><br>${targetToken.name}'s speed becomes 0 until the end of the current turn.`
    });
  }

  async function applyBonusDamage(workflow, targets, formula, flavor = `${ITEM_NAME}: bonus damage`, damageType = "bludgeoning") {
    const roll = await new Roll(formula, workflow.actor.getRollData()).evaluate();

    const targetNames = targets.map(t => t.name).join(", ");
    const byAnyMeans = getLevel(workflow.actor) >= 16
      ? `<br><em><strong>By Any Means:</strong> this bludgeoning damage ignores bludgeoning resistance.</em>`
      : "";
    const reminder = `<br><em>This is bonus damage only. Do not forget to roll/apply the base unarmed strike damage.</em>${byAnyMeans}`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
      flavor: `<strong>${flavor}</strong>${reminder}`
    });

    const targetUuids = targets
      .map(t => t?.document?.uuid)
      .filter(Boolean);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
      content: `
        <div class="sanctoria-damage-card">
          <strong>${flavor}</strong><br>
          Target${targets.length === 1 ? "" : "s"}: ${targetNames || "none"}<br>
          Bonus damage: <strong>${roll.total} ${damageType}</strong><br>
          <em>Apply this bonus damage separately from the base unarmed strike damage.</em><br>
          ${getLevel(workflow.actor) >= 16 ? `<em><strong>By Any Means:</strong> this bludgeoning damage ignores bludgeoning resistance.</em><br>` : ""}
          <button type="button" data-sanctoria-apply-damage="true">Apply Bonus Damage</button>
        </div>
      `,
      flags: {
        [FLAG_SCOPE]: {
          applyDamage: {
            damage: roll.total,
            type: damageType,
            targetUuids
          }
        }
      }
    });
  }

  async function impactTremor(sourceActor, targets) {
    const level = getLevel(sourceActor);
    const dc = getSaveDC(sourceActor);
    const results = [];
    for (const token of targets) {
      const actor = token.actor;
      if (!actor) continue;
      const disadvantage = level >= 12 && hasAnyStatus(actor, ["grappled", "restrained", "prone"]);
      const total = await rollSave(
        actor,
        "con",
        dc,
        disadvantage,
        level >= 16
          ? "Impact Tremor: resist being stunned or knocked prone; on a success, you still cannot take reactions until the start of the attacker's next turn."
          : level >= 8
            ? "Impact Tremor: resist being stunned until the end of the attacker's next turn."
            : "Impact Tremor: resist losing reactions until the start of the attacker's next turn."
      );
      const failed = total < dc;
      const failedBy5 = total <= dc - 5;
      let stunned = false, proned = false;

      if (!failed) {
        if (level >= 16) await applyNoReactions(token, "Impact Tremor Success Rider");
        results.push({ token, failed, stunned, proned });
        continue;
      }

      if (level >= 8) {
        await applyNativeStatus(token, "stunned");
        stunned = true;
      } else {
        await applyNoReactions(token, "Impact Tremor");
      }

      if (level >= 12 && failedBy5) {
        await applyNativeStatus(token, "prone");
        proned = true;
      }
      results.push({ token, failed, stunned, proned });
    }
    return results;
  }

  function isOpportunityAttack(workflow) {
    return [
      workflow?.options?.isOpportunityAttack,
      workflow?.workflowOptions?.isOpportunityAttack,
      workflow?.options?.opportunityAttack,
      workflow?.workflowOptions?.opportunityAttack,
      workflow?.item?.system?.activation?.type === "reaction",
      workflow?.activity?.activation?.type === "reaction",
      String(workflow?.flavor ?? "").toLowerCase().includes("opportunity")
    ].some(Boolean);
  }

  function distanceBetweenTokens(a, b) {
    const pixels = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
    return (pixels / canvas.grid.size) * (canvas.scene.grid.distance || 5);
  }

  function getNearbyTokens(originToken, maxFeet, excludeTokens = []) {
    const excluded = new Set(excludeTokens.map(t => t?.id).filter(Boolean));
    return canvas.tokens.placeables.filter(t => t.actor && !excluded.has(t.id) && !t.document.hidden && distanceBetweenTokens(originToken, t) <= maxFeet);
  }

  async function promptDebtorsPanic(sourceActor, triggerToken, excludeTokens = []) {
    if (getLevel(sourceActor) < 16) return;
    const sourceToken = getTokenForActor(sourceActor);
    if (!sourceToken) return;
    const candidates = getNearbyTokens(triggerToken, 10, [triggerToken, sourceToken, ...excludeTokens]);
    if (!candidates.length) return;

    const options = candidates.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
    const choice = await new Promise(resolve => {
      new Dialog({
        title: "Debtor's Panic",
        content: `<p><strong>${triggerToken.name}</strong> was stunned or knocked prone.</p><p>Force another creature within 10 feet to make a Wisdom save?</p><select id="debtors-panic-target"><option value="">No target</option>${options}</select>`,
        buttons: {
          yes: { label: "Force Save", callback: html => resolve(html.find("#debtors-panic-target").val()) },
          no: { label: "Skip", callback: () => resolve("") }
        },
        default: "no"
      }).render(true);
    });
    if (!choice) return;
    const targetToken = canvas.tokens.get(choice);
    if (!targetToken?.actor) return;
    const dc = getSaveDC(sourceActor);
    const total = await rollSave(targetToken.actor, "wis", dc, false, "Debtor\'s Panic: resist becoming frightened of the Debt Collectors wielder until the end of their next turn.");
    if (total < dc) {
      await applyNativeStatus(targetToken, "frightened");
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
        content: `<strong>${ITEM_NAME}: Debtor's Panic</strong><br>${targetToken.name} is frightened of ${sourceActor.name} until the end of your next turn.`
      });
    }
  }


  function gridStep(distanceFeet) {
    return Math.max(1, Math.round(distanceFeet / (canvas.scene.grid.distance || 5))) * canvas.grid.size;
  }

  function snapTopLeft(x, y) {
    const g = canvas.grid.size;
    return { x: Math.round(x / g) * g, y: Math.round(y / g) * g };
  }

  function feetBetweenPoints(a, b) {
    const pixels = Math.hypot(a.x - b.x, a.y - b.y);
    return (pixels / canvas.grid.size) * (canvas.scene.grid.distance || 5);
  }

  function centerFromDoc(doc, x = doc.x, y = doc.y) {
    const g = canvas.grid.size;
    return {
      x: Number(x ?? 0) + Number(doc.width ?? 1) * g / 2,
      y: Number(y ?? 0) + Number(doc.height ?? 1) * g / 2
    };
  }

  async function moveTokenByVector(token, unitX, unitY, distanceFeet) {
    const pixels = gridStep(distanceFeet);
    const rawX = token.document.x + unitX * pixels;
    const rawY = token.document.y + unitY * pixels;
    const snapped = snapTopLeft(rawX, rawY);
    await token.document.update({ x: snapped.x, y: snapped.y });
    return true;
  }

  async function recordTokenMovement(tokenDocument, changed) {
    if (!("x" in changed) && !("y" in changed)) return;
    const actor = tokenDocument.actor;
    if (!actor) return;

    const from = centerFromDoc(tokenDocument);
    const to = centerFromDoc(
      tokenDocument,
      "x" in changed ? changed.x : tokenDocument.x,
      "y" in changed ? changed.y : tokenDocument.y
    );

    const distanceFeet = feetBetweenPoints(from, to);
    if (distanceFeet <= 0) return;

    await actor.setFlag(FLAG_SCOPE, FLAGS.lastMovement, {
      from, to, distanceFeet,
      sceneId: canvas.scene?.id,
      time: Date.now()
    });
  }

  function qualifiesForBreakTheLine(actor, targetToken) {
    if (getLevel(actor) < 16) return false;

    const prime = actor.getFlag(FLAG_SCOPE, FLAGS.breakTheLinePrime);
    const lastMove = actor.getFlag(FLAG_SCOPE, FLAGS.lastMovement);
    const move = prime ?? lastMove;

    if (!move) return false;
    if (move.sceneId && move.sceneId !== canvas.scene?.id) return false;
    if (Date.now() - Number(move.time ?? 0) > 600000) return false;

    const currentToken = getTokenForActor(actor);
    if (!currentToken) return false;

    const from = move.from;
    const to = currentToken.center;
    const distanceFeet = feetBetweenPoints(from, to);

    if (distanceFeet < 15) return false;

    const targetCenter = targetToken.center;
    const before = feetBetweenPoints(from, targetCenter);
    const after = feetBetweenPoints(to, targetCenter);

    return after < before;
  }

  async function promptBreakTheLine(workflow, attackerToken, targetToken, actor) {
    const qualifies = qualifiesForBreakTheLine(actor, targetToken);
    console.log(`${MODULE}: Break the Line qualification`, {
      qualifies,
      actor: actor?.name,
      target: targetToken?.name,
      prime: actor.getFlag(FLAG_SCOPE, FLAGS.breakTheLinePrime),
      lastMovement: actor.getFlag(FLAG_SCOPE, FLAGS.lastMovement)
    });

    if (!qualifies) return;

    const useBreak = await Dialog.confirm({
      title: "Break the Line",
      content: `<p>You moved at least 15 feet toward <strong>${targetToken.name}</strong> and hit with an unarmed strike.</p><p>Use <strong>Break the Line</strong>?</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    await actor.unsetFlag(FLAG_SCOPE, FLAGS.breakTheLinePrime);

    if (!useBreak) return;

    await applyBonusDamage(workflow, [targetToken], "2d6[bludgeoning]", `${ITEM_NAME}: Break the Line damage`);

    const dc = getSaveDC(actor);
    const total = await rollSave(targetToken.actor, "str", dc, false, "Break the Line: resist being knocked prone or pushed 15 feet away.");

    if (total >= dc) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<strong>${ITEM_NAME}: Break the Line</strong><br>${targetToken.name} succeeds on the Strength save.`
      });
      return;
    }

    const outcome = await new Promise(resolve => {
      new Dialog({
        title: "Break the Line Outcome",
        content: `<p>${targetToken.name} failed the Strength save. Choose the result.</p>`,
        buttons: {
          prone: { label: "Knock Prone", callback: () => resolve("prone") },
          push: { label: "Push 15 ft", callback: () => resolve("push") }
        },
        default: "prone"
      }).render(true);
    });

    if (outcome === "prone") {
      await applyNativeStatus(targetToken, "prone");
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<strong>${ITEM_NAME}: Break the Line</strong><br>${targetToken.name} is knocked prone.`
      });
      await promptDebtorsPanic(actor, targetToken, [targetToken]);
    } else if (outcome === "push") {
      // Break the Line's 15 ft push replaces Bully's Shove only for this hit.
      // It does NOT consume the once-per-turn Bully's Shove use for later attacks.
      await actor.setFlag(FLAG_SCOPE, FLAGS.skipBullyShoveThisHit, true);

      const pushed = await pushTokenAway(attackerToken, targetToken, 15);
      if (pushed) {
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<strong>${ITEM_NAME}: Break the Line</strong><br>${targetToken.name} is pushed 15 feet away. <em>GM adjudicates collision damage if applicable.</em>`
        });
      }
    }
  }

  async function moveTokenToward(tokenToMove, targetToken, distanceFeet) {
    const dx = targetToken.center.x - tokenToMove.center.x;
    const dy = targetToken.center.y - tokenToMove.center.y;
    const len = Math.hypot(dx, dy);
    if (!len) return false;
    return await moveTokenByVector(tokenToMove, dx / len, dy / len, distanceFeet);
  }

  async function pushTokenAway(attackerToken, targetToken, distanceFeet) {
    const dx = targetToken.center.x - attackerToken.center.x;
    const dy = targetToken.center.y - attackerToken.center.y;
    const len = Math.hypot(dx, dy);
    if (!len) {
      ui.notifications.warn("Cannot determine shove direction.");
      return false;
    }
    return await moveTokenByVector(targetToken, dx / len, dy / len, distanceFeet);
  }

  async function clearBullyShoveForActor(actor) {
    if (!actor) return;
    if (actor.getFlag(FLAG_SCOPE, FLAGS.bullyShoveUsed) !== undefined) await actor.unsetFlag(FLAG_SCOPE, FLAGS.bullyShoveUsed);
  }

  async function promptCrushingAdvance(attackerToken, targetToken, actor) {
    if (getLevel(actor) < 12) return;
    const useAdvance = await Dialog.confirm({
      title: "Crushing Advance",
      content: `<p>Use <strong>Crushing Advance</strong> to move up to 10 feet toward <strong>${targetToken.name}</strong>?</p><p><em>This movement does not provoke opportunity attacks and must end closer to the pushed creature.</em></p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    if (!useAdvance) return;
    const moved = await moveTokenToward(attackerToken, targetToken, 10);
    if (moved) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<strong>${ITEM_NAME}: Crushing Advance</strong><br>${attackerToken.name} moves up to 10 feet toward ${targetToken.name} without provoking opportunity attacks.`
      });
    }
  }

  async function promptBullysShove(attackerToken, targetToken, actor) {
    const skipThisHit = actor.getFlag(FLAG_SCOPE, FLAGS.skipBullyShoveThisHit);
    if (skipThisHit) {
      await actor.unsetFlag(FLAG_SCOPE, FLAGS.skipBullyShoveThisHit);
      console.log(`${MODULE}: Bully's Shove skipped for this hit because Break the Line push was used. Same-hit suppression cleared.`);
      return;
    }

    if (!getDebtCollectors(actor)) return;
    if (actor.getFlag(FLAG_SCOPE, FLAGS.bullyShoveUsed)) return;
    const distanceFeet = getLevel(actor) >= 8 ? 10 : 5;
    const useShove = await Dialog.confirm({
      title: "Bully's Shove",
      content: `<p>Use <strong>Bully's Shove</strong> to push <strong>${targetToken.name}</strong> ${distanceFeet} feet directly away?</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    if (!useShove) return;
    await actor.setFlag(FLAG_SCOPE, FLAGS.bullyShoveUsed, true);
    const pushed = await pushTokenAway(attackerToken, targetToken, distanceFeet);
    if (!pushed) return;
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<strong>${ITEM_NAME}: Bully's Shove</strong><br>${targetToken.name} is pushed ${distanceFeet} feet directly away from ${attackerToken.name}.<br><em>GM adjudicates collision damage if applicable.</em>`
    });
    await promptCrushingAdvance(attackerToken, targetToken, actor);
  }

  Hooks.on("midi-qol.AttackRollComplete", async workflow => {
    try {

      if (!isUnarmedItem(workflow?.item)) return;
      const actor = workflow.actor;
      if (!getDebtCollectors(actor)) return;

      const attackTotal = Number(workflow.attackRoll?.total) || Number(workflow.attackTotal) || Number(workflow.hitDisplayData?.attackTotal);
      const targets = Array.from(workflow.targets ?? []);
      const hitTargets = targets.filter(t => attackTotal >= getTargetAC(t));

      const firstDie = workflow.attackRoll?.dice?.[0]?.total;
      const isNat1 =
        workflow.attackRoll?.isFumble === true ||
        firstDie === 1;

      console.log(`${MODULE}: attack resolved`, {
        attackTotal,
        firstDie,
        isNat1,
        hitTargets: hitTargets.map(t => t.name),
        opportunity: isOpportunityAttack(workflow)
      });

      if (isNat1) {
        console.log(`${MODULE}: natural 1 detected — suppressing Debt Collectors effects.`);
        return;
      }

      if (!hitTargets.length) return;

      await applyBonusDamage(workflow, hitTargets, getDamageFormula(actor));

      const attackerToken =
        workflow.token ??
        canvas.tokens?.get(workflow.tokenId) ??
        getTokenForActor(actor);

      if (!attackerToken) {
        console.warn(`${MODULE}: could not resolve attacker token for Bully's Shove.`);
      }

      if (attackerToken && hitTargets.length === 1) {
        await promptBreakTheLine(workflow, attackerToken, hitTargets[0], actor);
      }

      console.log(`${MODULE}: Break the Line pre-check`, {
        hasAttackerToken: !!attackerToken,
        hitTargetCount: hitTargets.length,
        level: getLevel(actor),
        prime: actor.getFlag(FLAG_SCOPE, FLAGS.breakTheLinePrime),
        lastMovement: actor.getFlag(FLAG_SCOPE, FLAGS.lastMovement)
      });

      if (attackerToken && hitTargets.length === 1) {
        await promptBreakTheLine(workflow, attackerToken, hitTargets[0], actor);
      }

      // Prompt Bully's Shove before secondary rider prompts so it does not get skipped by Debtor's Panic UI flow.
      if (attackerToken && hitTargets.length === 1) {
        await promptBullysShove(attackerToken, hitTargets[0], actor);
      }

      // Collection Day hit rider applies to unarmed strike hits during the capstone activation.
      for (const target of hitTargets) {
        await collectionDayHitRider(workflow, target, actor);
      }

      const tremorResults = await impactTremor(actor, hitTargets);

      for (const result of tremorResults) {
        if (result.stunned || result.proned) await promptDebtorsPanic(actor, result.token, hitTargets);
      }

      const firstDieForFinalNotice = workflow.attackRoll?.dice?.[0]?.total;
      const isCritForFinalNotice =
        workflow.attackRoll?.isCritical === true ||
        firstDieForFinalNotice === 20;

      if (attackerToken && hitTargets.length === 1) {
        const stunnedTarget = tremorResults.find(r => r.stunned);
        if (isCritForFinalNotice) {
          await promptFinalNotice(workflow, attackerToken, hitTargets[0], actor, "critical hit");
        } else if (stunnedTarget) {
          await promptFinalNotice(workflow, attackerToken, stunnedTarget.token, actor, "stunning a creature");
        }
      }

      if (getLevel(actor) >= 12 && isOpportunityAttack(workflow)) {
        for (const target of hitTargets) await applySpeedZero(target, actor);
      }
    } catch (err) {
      console.error(`${MODULE}:`, err);
    }
  });

  Hooks.on("preUpdateToken", async (tokenDocument, changed) => {
    try {
      if (!("x" in changed) && !("y" in changed)) return;

      const actor = tokenDocument.actor;
      if (!actor) return;

      await actor.setFlag(FLAG_SCOPE, "movementStart", {
        from: centerFromDoc(tokenDocument, tokenDocument.x, tokenDocument.y),
        sceneId: canvas.scene?.id,
        time: Date.now()
      });
    } catch (err) {
      console.warn(`${MODULE}: failed to cache movement start`, err);
    }
  });

  Hooks.on("updateToken", async (tokenDocument, changed, options, userId) => {
    try {
      if (!("x" in changed) && !("y" in changed)) return;

      const actor = tokenDocument.actor;
      if (!actor) return;

      const oldX = "x" in changed ? (tokenDocument.x - changed.x + (options?.diff === false ? 0 : 0)) : tokenDocument.x;
      const oldY = "y" in changed ? (tokenDocument.y - changed.y + (options?.diff === false ? 0 : 0)) : tokenDocument.y;

      // updateToken fires after the document has changed. Foundry does not consistently provide
      // the previous coordinates in this hook, so use the pre-move position cached by preUpdateToken
      // when available, otherwise fall back to the last known actor movement endpoint.
      const cached = actor.getFlag(FLAG_SCOPE, "movementStart");
      const from = cached?.sceneId === canvas.scene?.id
        ? cached.from
        : centerFromDoc(tokenDocument, oldX, oldY);

      const to = centerFromDoc(tokenDocument, tokenDocument.x, tokenDocument.y);
      const distanceFeet = feetBetweenPoints(from, to);

      if (distanceFeet <= 0) return;

      await actor.setFlag(FLAG_SCOPE, FLAGS.lastMovement, {
        from,
        to,
        distanceFeet,
        sceneId: canvas.scene?.id,
        time: Date.now()
      });

      await actor.unsetFlag(FLAG_SCOPE, "movementStart");

      console.log(`${MODULE}: movement recorded`, {
        actor: actor.name,
        distanceFeet,
        from,
        to
      });

    } catch (err) {
      console.warn(`${MODULE}: failed to record token movement`, err);
    }
  });

  Hooks.on("updateCombat", async (combat, changed) => {
    if (!("turn" in changed) && !("round" in changed)) return;
    await resetDebtCollectorsTurnFlags(combat.combatant?.actor);
  });

  globalThis.DebtCollectorsCleanSelected = async function() {
    const actor = canvas.tokens.controlled[0]?.actor;
    if (!actor) return ui.notifications.warn("Select one token first.");
    const ids = actor.effects
      .filter(e => e.name?.includes(ITEM_NAME) || e.flags?.["debt-collectors"]?.source === ITEM_NAME)
      .map(e => e.id);
    if (!ids.length) return ui.notifications.info("No Debt Collectors effects found on selected token.");
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    ui.notifications.info(`Removed ${ids.length} Debt Collectors effect(s).`);
  };



  function isCollectionDayActive(actor) {
    return !!actor?.getFlag(FLAG_SCOPE, FLAGS.collectionDayActive);
  }

  function getCollectionDayEffect(actor) {
    return actor?.effects?.find(e =>
      e.name === `${ITEM_NAME}: Collection Day` ||
      e.flags?.["debt-collectors"]?.feature === "Collection Day"
    );
  }

  async function clearCollectionDay(actor) {
    if (!actor) return;

    await actor.unsetFlag(FLAG_SCOPE, FLAGS.collectionDayActive);
    await actor.unsetFlag(FLAG_SCOPE, FLAGS.finalNoticeUsed);

    const ids = actor.effects
      .filter(e =>
        e.name === `${ITEM_NAME}: Collection Day` ||
        e.flags?.["debt-collectors"]?.feature === "Collection Day"
      )
      .map(e => e.id);

    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  async function activateCollectionDay(actor) {
    const level = getLevel(actor);

    if (level < 20) {
      return ui.notifications.warn("Collection Day requires Debt Collectors Level 20.");
    }

    if (!getDebtCollectors(actor)) {
      return ui.notifications.warn(`${actor.name} must have ${ITEM_NAME} equipped and attuned.`);
    }

    if (actor.getFlag(FLAG_SCOPE, FLAGS.collectionDayUsed)) {
      return ui.notifications.warn("Collection Day has already been used. It recharges after a long rest.");
    }

    await clearCollectionDay(actor);

    await actor.setFlag(FLAG_SCOPE, FLAGS.collectionDayActive, true);
    await actor.setFlag(FLAG_SCOPE, FLAGS.collectionDayUsed, true);

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `${ITEM_NAME}: Collection Day`,
      icon: "icons/svg/aura.svg",
      origin: getDebtCollectors(actor)?.uuid ?? null,
      duration: {
        rounds: 10,
        seconds: 60,
        startRound: game.combat?.round ?? null,
        startTurn: game.combat?.turn ?? null,
        startTime: game.time?.worldTime ?? null
      },
      changes: [
        { key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10, priority: 20 },
        { key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "bludgeoning", priority: 20 },
        { key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "piercing", priority: 20 },
        { key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "slashing", priority: 20 },
        { key: "system.traits.ci.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "frightened", priority: 20 },
        { key: "system.traits.ci.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "stunned", priority: 20 }
      ],
      flags: {
        dae: { stackable: "noneName", specialDuration: [] },
        "debt-collectors": { source: ITEM_NAME, feature: "Collection Day", removable: true }
      }
    }]);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <strong>${ITEM_NAME}: Collection Day</strong><br>
        For 1 minute, ${actor.name} gains:<br>
        • Resistance to bludgeoning, piercing, and slashing damage<br>
        • Immunity to being frightened or stunned<br>
        • +10 ft speed<br>
        • Unarmed strike hits deal +1d6 psychic damage and force a Wisdom save or frightened<br>
        • No Safe Distance and Final Notice become active<br>
        <em>Collection Day recharges on a long rest.</em>
      `
    });

    ui.notifications.info(`Collection Day activated for ${actor.name}.`);
  }

  async function collectionDayHitRider(workflow, targetToken, actor) {
    if (!isCollectionDayActive(actor)) return;

    await applyBonusDamage(
      workflow,
      [targetToken],
      "1d6[psychic]",
      `${ITEM_NAME}: Collection Day psychic damage`,
      "psychic"
    );

    const dc = getSaveDC(actor);
    const total = await rollSave(
      targetToken.actor,
      "wis",
      dc,
      false,
      "Collection Day: resist becoming frightened of the Debt Collectors wielder until the end of their next turn."
    );

    if (total < dc) {
      await applyNativeStatus(targetToken, "frightened");

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <strong>${ITEM_NAME}: Collection Day</strong><br>
          ${targetToken.name} is frightened of ${actor.name} until the end of ${actor.name}'s next turn.<br>
          <em>While frightened this way, the creature cannot willingly move closer and cannot willingly move farther away unless it first succeeds on another Wisdom save.</em>
        `
      });
    }
  }

  async function promptFinalNotice(workflow, attackerToken, triggerToken, actor, reason = "trigger") {
    if (getLevel(actor) < 20) return;
    if (!isCollectionDayActive(actor)) return;

    if (actor.getFlag(FLAG_SCOPE, FLAGS.finalNoticeUsed)) return;

    const useFinal = await Dialog.confirm({
      title: "Final Notice",
      content: `
        <p><strong>Final Notice</strong> triggered by: <strong>${reason}</strong>.</p>
        <p>Move up to half your speed and make one additional unarmed strike?</p>
        <p><em>The module will post the permission/reminder. Resolve movement and the extra unarmed strike normally.</em></p>
      `,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!useFinal) return;

    await actor.setFlag(FLAG_SCOPE, FLAGS.finalNoticeUsed, true);

    const speed = Number(actor.system?.attributes?.movement?.walk ?? 30);
    const halfSpeed = Math.floor(speed / 2);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <strong>${ITEM_NAME}: Final Notice</strong><br>
        ${actor.name} may immediately move up to <strong>${halfSpeed} ft</strong> and make one additional unarmed strike.<br>
        <em>This can trigger once per turn during Collection Day. Move the token manually, then roll the extra unarmed strike from the character sheet.</em>
      `
    });
  }

  async function resetDebtCollectorsTurnFlags(actor) {
    if (!actor) return;
    await actor.unsetFlag(FLAG_SCOPE, FLAGS.bullyShoveUsed);
    await actor.unsetFlag(FLAG_SCOPE, FLAGS.finalNoticeUsed);
  }

  globalThis.DebtCollectorsCollectionDay = async function() {
    const actor = canvas.tokens.controlled[0]?.actor;
    if (!actor) return ui.notifications.warn("Select the Debt Collectors wielder first.");
    await activateCollectionDay(actor);
  };

  globalThis.DebtCollectorsClearCollectionDaySelected = async function() {
    const actor = canvas.tokens.controlled[0]?.actor;
    if (!actor) return ui.notifications.warn("Select a token first.");
    await clearCollectionDay(actor);
    ui.notifications.info(`Collection Day cleared for ${actor.name}.`);
  };

  globalThis.DebtCollectorsLongRestResetSelected = async function() {
    const actor = canvas.tokens.controlled[0]?.actor;
    if (!actor) return ui.notifications.warn("Select the Debt Collectors wielder first.");
    await actor.unsetFlag(FLAG_SCOPE, FLAGS.collectionDayUsed);
    await actor.unsetFlag(FLAG_SCOPE, FLAGS.collectionDayActive);
    await actor.unsetFlag(FLAG_SCOPE, FLAGS.finalNoticeUsed);
    ui.notifications.info(`Debt Collectors long-rest recharge reset for ${actor.name}.`);
  };

  globalThis.DebtCollectorsNoSafeDistance = async function() {
    const sourceToken = canvas.tokens.controlled[0];
    const teleportingToken = Array.from(game.user.targets ?? [])[0];

    if (!sourceToken?.actor) return ui.notifications.warn("Select the Collection Day wielder first.");
    if (!teleportingToken?.actor) return ui.notifications.warn("Target the creature attempting to teleport.");

    const actor = sourceToken.actor;

    if (!isCollectionDayActive(actor)) {
      return ui.notifications.warn("No Safe Distance requires Collection Day to be active.");
    }

    const distance = distanceBetweenTokens(sourceToken, teleportingToken);
    if (distance > 30) {
      return ui.notifications.warn(`${teleportingToken.name} is ${Math.round(distance)} ft away, outside No Safe Distance.`);
    }

    const dc = getSaveDC(actor);
    const total = await rollSave(
      teleportingToken.actor,
      "cha",
      dc,
      false,
      "No Safe Distance: succeed or the attempted teleport fails."
    );

    if (total < dc) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<strong>${ITEM_NAME}: No Safe Distance</strong><br>${teleportingToken.name}'s teleport fails.`
      });
    } else {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<strong>${ITEM_NAME}: No Safe Distance</strong><br>${teleportingToken.name} succeeds and may teleport.`
      });
    }
  };

  function getDebtCollectorsAttackBonus(actor) {
    const level = getLevel(actor);
    return level >= 8 ? 2 : 1;
  }

  function findUnarmedStrikeItem(actor) {
    return actor?.items?.find(i => isUnarmedItem(i)) ??
      actor?.items?.find(i => String(i.name ?? "").toLowerCase().includes("unarmed")) ??
      null;
  }

  function extractDamagePartsFromActivity(activity) {
    const parts = [];

    const damage = activity?.damage;
    if (!damage) return parts;

    if (Array.isArray(damage.parts)) {
      for (const part of damage.parts) {
        if (Array.isArray(part)) {
          if (part[0]) parts.push({ formula: String(part[0]), type: part[1] ?? "bludgeoning" });
        } else if (part?.formula) {
          parts.push({ formula: String(part.formula), type: part.type ?? part.damageType ?? "bludgeoning" });
        }
      }
    }

    if (damage.formula) {
      parts.push({ formula: String(damage.formula), type: damage.type ?? "bludgeoning" });
    }

    return parts;
  }

  function getUnarmedBaseDamage(actor) {
    const item = findUnarmedStrikeItem(actor);
    const rollData = actor.getRollData?.() ?? {};
    const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);

    if (item) {
      const activities = Object.values(item.system?.activities ?? {});
      for (const activity of activities) {
        const parts = extractDamagePartsFromActivity(activity);
        if (parts.length) {
          return {
            item,
            formula: parts.map(p => p.formula).join(" + "),
            type: parts[0]?.type ?? "bludgeoning",
            found: true
          };
        }
      }

      const base = item.system?.damage?.base;
      if (base?.number && base?.denomination) {
        const bonus = base?.bonus ? ` + ${base.bonus}` : "";
        const type = Array.isArray(base?.types) && base.types.length ? base.types[0] : "bludgeoning";
        return {
          item,
          formula: `${base.number}d${base.denomination}${bonus}`,
          type,
          found: true
        };
      }

      const parts = item.system?.damage?.parts;
      if (Array.isArray(parts) && parts.length) {
        const formulas = parts.map(p => Array.isArray(p) ? p[0] : p?.formula).filter(Boolean);
        const type = (Array.isArray(parts[0]) ? parts[0][1] : parts[0]?.type) ?? "bludgeoning";
        if (formulas.length) {
          return {
            item,
            formula: formulas.join(" + "),
            type,
            found: true
          };
        }
      }
    }

    // Fallback for basic unarmed strike. This may not capture Monk/Martial Arts/Empowered Strike.
    return {
      item,
      formula: `1 + ${strMod}`,
      type: "bludgeoning",
      found: false
    };
  }

  async function rollAndPostBaseUnarmedDamage(actor, targetToken) {
    const base = getUnarmedBaseDamage(actor);
    const roll = await new Roll(base.formula, actor.getRollData?.() ?? {}).evaluate();

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<strong>${ITEM_NAME}: Cornered Animal base unarmed damage</strong><br><em>${base.found ? `Detected from ${base.item?.name ?? "unarmed strike"}.` : "Fallback formula used. If your character has Martial Arts, Empowered Strike, or another modified unarmed strike, roll/apply the correct base damage manually instead."}</em>`
    });

    const targetName = targetToken?.name ?? "target";

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="sanctoria-damage-card">
          <strong>${ITEM_NAME}: Cornered Animal Base Damage</strong><br>
          Target: ${targetName}<br>
          Base unarmed damage: <strong>${roll.total} ${base.type}</strong><br>
          <em>This is the opportunity attack's normal unarmed strike damage.</em><br>
          <button type="button" data-sanctoria-apply-damage="true">Apply Bonus Damage</button>
        </div>
      `,
      flags: {
        [FLAG_SCOPE]: {
          applyDamage: {
            damage: roll.total,
            type: base.type,
            targetUuids: targetToken?.document?.uuid ? [targetToken.document.uuid] : []
          }
        }
      }
    });
  }

  globalThis.DebtCollectorsCorneredAnimal = async function() {
    const attackerToken = canvas.tokens.controlled[0];
    const targetToken = Array.from(game.user.targets ?? [])[0];

    if (!attackerToken?.actor) {
      return ui.notifications.warn("Select the Debt Collectors wielder first.");
    }

    if (!targetToken?.actor) {
      return ui.notifications.warn("Target one creature first.");
    }

    const actor = attackerToken.actor;
    const targetActor = targetToken.actor;

    const debtCollectors = getDebtCollectors(actor);
    if (!debtCollectors) {
      return ui.notifications.warn(`${actor.name} must have ${ITEM_NAME} equipped and attuned.`);
    }

    if (getLevel(actor) < 12) {
      return ui.notifications.warn("Cornered Animal requires Debt Collectors Level 12+.");
    }

    const prof = Number(actor.system?.attributes?.prof ?? 0);
    const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);
    const magicBonus = getDebtCollectorsAttackBonus(actor);
    const attackFormula = `1d20 + ${prof} + ${strMod} + ${magicBonus}`;

    const attackRoll = await new Roll(attackFormula, actor.getRollData?.() ?? {}).evaluate();
    const firstDie = attackRoll.dice?.[0]?.total;
    const targetAC = getTargetAC(targetToken);
    const isNat1 = firstDie === 1;
    const isNat20 = firstDie === 20;
    const hits = !isNat1 && (isNat20 || attackRoll.total >= targetAC);

    await attackRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<strong>${ITEM_NAME}: Cornered Animal Opportunity Attack</strong><br><em>Attack vs ${targetToken.name} AC ${targetAC}. On hit, target speed becomes 0 until the end of the current turn.</em>`
    });

    if (!hits) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<strong>${ITEM_NAME}: Cornered Animal</strong><br>${actor.name} misses ${targetToken.name}. No Debt Collectors rider applies.`
      });
      return;
    }

    await applySpeedZero(targetToken, actor);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<strong>${ITEM_NAME}: Cornered Animal Hit</strong><br>${targetToken.name}'s speed becomes 0 until the end of the current turn.<br><em>Bully's Shove and Break the Line do not trigger from this reaction helper.</em>`
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <strong>${ITEM_NAME}: Cornered Animal Damage Reminder</strong><br>
        Roll/apply the normal unarmed strike damage for this opportunity attack using the character sheet.<br>
        <em>The Debt Collectors bonus damage is rolled separately below.</em>
        ${getLevel(actor) >= 16 ? `<br><em><strong>By Any Means:</strong> this unarmed strike ignores bludgeoning resistance and deals full damage to objects and structures.</em>` : ""}
      `
    });

    await applyBonusDamage(
      { actor, item: debtCollectors },
      [targetToken],
      getDamageFormula(actor),
      `${ITEM_NAME}: Cornered Animal Debt Collectors bonus damage`,
      "bludgeoning"
    );
  };

  globalThis.DebtCollectorsPrimeBreakTheLine = async function() {
    const token = canvas.tokens.controlled[0];

    if (!token?.actor) {
      return ui.notifications.warn("Select the Debt Collectors wielder first.");
    }

    const actor = token.actor;

    if (!getDebtCollectors(actor)) {
      return ui.notifications.warn(`${actor.name} must have ${ITEM_NAME} equipped and attuned.`);
    }

    if (getLevel(actor) < 16) {
      return ui.notifications.warn("Break the Line requires Debt Collectors Level 16+.");
    }

    if (actor.flags?.[FLAG_SCOPE]?.undefined !== undefined) {
      await actor.unsetFlag(FLAG_SCOPE, "undefined");
    }

    await actor.setFlag(FLAG_SCOPE, FLAGS.breakTheLinePrime, {
      from: {
      x: token.center.x,
      y: token.center.y
    },
      sceneId: canvas.scene?.id,
      time: Date.now()
    });

    ui.notifications.info(`Break the Line primed for ${actor.name}. Move 15+ ft toward a target, then hit with an unarmed strike.`);
    console.log(`${MODULE}: Break the Line primed`, {
      actor: actor.name,
      from: token.center
    });
  };

  globalThis.DebtCollectorsClearBreakTheLinePrime = async function() {
    const actor = canvas.tokens.controlled[0]?.actor;
    if (!actor) return ui.notifications.warn("Select a token first.");
    await actor.unsetFlag(FLAG_SCOPE, FLAGS.breakTheLinePrime);
    if (actor.flags?.[FLAG_SCOPE]?.undefined !== undefined) {
      await actor.unsetFlag(FLAG_SCOPE, "undefined");
    }
    ui.notifications.info(`Break the Line prime cleared for ${actor.name}.`);
  };

  Hooks.on("renderChatMessage", (message, html) => {
    const root = html?.[0] ?? html;
    const button = root?.querySelector?.("[data-sanctoria-apply-damage]");
    if (!button) return;

    button.addEventListener("click", async event => {
      event.preventDefault();

      const data = message.getFlag(FLAG_SCOPE, "applyDamage");
      if (!data) return ui.notifications.warn("No Sanctoria damage data found on this card.");

      let tokens = [];

      for (const uuid of data.targetUuids ?? []) {
        try {
          const doc = await fromUuid(uuid);
          const tokenObject = doc?.object ?? canvas.tokens?.get(doc?.id);
          if (tokenObject) tokens.push(tokenObject);
        } catch (err) {
          console.warn(`${MODULE}: failed to resolve stored target UUID`, uuid, err);
        }
      }

      if (!tokens.length) {
        tokens = Array.from(game.user.targets ?? []);
      }

      if (!tokens.length && canvas.tokens.controlled.length === 1) {
        tokens = [canvas.tokens.controlled[0]];
      }

      if (!tokens.length) {
        return ui.notifications.warn("No target found. Target the creature, then click Apply Bonus Damage again.");
      }

      const damage = Number(data.damage ?? 0);
      const type = data.type ?? "bludgeoning";

      if (!damage) {
        return ui.notifications.warn("Damage amount missing from this card.");
      }

      console.log(`${MODULE}: directly applying bonus damage`, {
        damage,
        type,
        targets: tokens.map(t => t.name)
      });

      const results = [];

      for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        const hpPath = "system.attributes.hp.value";
        const current = Number(foundry.utils.getProperty(actor, hpPath) ?? 0);
        const next = Math.max(0, current - damage);

        await actor.update({ [hpPath]: next });

        results.push(`${token.name}: ${current} → ${next}`);
      }

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        content: `
          <strong>Sanctoria Automation: Bonus Damage Applied</strong><br>
          ${damage} ${type} damage applied directly.<br>
          ${results.join("<br>")}
        `
      });

      ui.notifications.info(`Applied ${damage} ${type} bonus damage directly.`);
    });
  });

  globalThis.DebtCollectorsClearSpeedZeroSelected = async function() {
    const actor = canvas.tokens.controlled[0]?.actor;
    if (!actor) return ui.notifications.warn("Select the affected token first.");

    const ids = actor.effects
      .filter(e =>
        e.name?.includes("Cornered Animal") ||
        e.flags?.["debt-collectors"]?.feature === "Cornered Animal"
      )
      .map(e => e.id);

    if (!ids.length) {
      return ui.notifications.info(`No Cornered Animal speed reduction found on ${actor.name}.`);
    }

    await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    ui.notifications.info(`Removed ${ids.length} Cornered Animal speed reduction effect(s) from ${actor.name}.`);
  };

  Hooks.on("dnd5e.restCompleted", async (actor, data) => {
    try {
      const isLongRest =
        data?.longRest === true ||
        data?.type === "long" ||
        data?.restType === "long" ||
        data?.newDay === true;

      if (!isLongRest) return;

      if (actor?.getFlag?.(FLAG_SCOPE, FLAGS.collectionDayUsed) !== undefined) {
        await actor.unsetFlag(FLAG_SCOPE, FLAGS.collectionDayUsed);
      }

      await actor?.unsetFlag?.(FLAG_SCOPE, FLAGS.collectionDayActive);
      await actor?.unsetFlag?.(FLAG_SCOPE, FLAGS.finalNoticeUsed);

      console.log(`${MODULE}: long rest reset processed`, { actor: actor?.name });
    } catch (err) {
      console.warn(`${MODULE}: long rest reset hook failed`, err);
    }
  });

  console.log(`${MODULE}: registered`);
});
