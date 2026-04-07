import { type MatchAction, type MatchCard, type MatchState, type Owner, type UnitState } from "./types";

function getSide(state: MatchState, owner: Owner) {
  return owner === "player" ? state.player : state.ai;
}

function getEnemyOwner(owner: Owner): Owner {
  return owner === "player" ? "ai" : "player";
}

function getPlayCost(state: MatchState, card: MatchCard, free = false) {
  return free ? 0 : card.willCost * state.turn.willMultiplier;
}

function canStillPlay(state: MatchState) {
  return state.turn.playLimit === null || state.turn.playsMade < state.turn.playLimit;
}

function getBoardUnits(state: MatchState, owner: Owner) {
  return getSide(state, owner).board.filter((unit): unit is UnitState => unit !== null);
}

function getOpenSlot(state: MatchState, owner: Owner) {
  return getSide(state, owner).board.findIndex((entry) => entry === null);
}

function getReadyUnits(state: MatchState, owner: Owner) {
  return getBoardUnits(state, owner).filter((unit) => !unit.exhausted && unit.attack > 0);
}

function getTotalReadyAttack(state: MatchState, owner: Owner) {
  return getReadyUnits(state, owner).reduce((sum, unit) => sum + unit.attack, 0);
}

function getBoardPower(units: UnitState[]) {
  return units.reduce((sum, unit) => sum + unit.attack * 1.6 + unit.health * 0.9, 0);
}

function canPlayCard(state: MatchState, owner: Owner, card: MatchCard, free = false) {
  const side = getSide(state, owner);
  const openSlot = getOpenSlot(state, owner);
  if (openSlot === -1) return false;
  return side.will >= getPlayCost(state, card, free);
}

function scoreScriptedEffect(state: MatchState, owner: Owner, card: MatchCard) {
  const side = getSide(state, owner);
  const enemyOwner = getEnemyOwner(owner);
  const enemy = getSide(state, enemyOwner);
  const myUnits = getBoardUnits(state, owner);
  const enemyUnits = getBoardUnits(state, enemyOwner);
  const enemyReadyUnits = getReadyUnits(state, enemyOwner);

  switch (card.scriptedEffectKey) {
    case "reverse_heart": {
      const hpDiff = enemy.hp - side.hp;
      return hpDiff > 0 ? hpDiff * 2.8 : -8;
    }

    case "dragon_eye": {
      return enemy.deck.length > 0 ? 2.5 + Math.min(4, enemy.deck.length * 0.15) : -6;
    }

    case "oracle": {
      return enemy.hand.length > 0 ? 5 + Math.min(5, enemy.hand.length * 0.7) : -6;
    }

    case "sandstorm": {
      return enemy.hp <= 3 ? 100 : 7.5;
    }

    case "energy_sword": {
      return enemy.hp <= 4 ? 120 : 9.5;
    }

    case "shadow_sword": {
      return enemy.hp <= 2 ? 90 : 6;
    }

    case "tree_of_life": {
      const missingHp = side.maxHp - side.hp;
      return missingHp <= 0 ? -10 : 4 + Math.min(14, missingHp * 1.5);
    }

    case "shield_of_hope": {
      if (side.shield) return -12;
      const smallAttackers = enemyReadyUnits.filter((unit) => unit.attack <= 3).length;
      const totalEnemyPressure = enemyReadyUnits.reduce((sum, unit) => sum + unit.attack, 0);
      return 3 + smallAttackers * 3 + totalEnemyPressure * 0.45;
    }

    case "double_speed": {
      const myAdvantage =
        (side.hp - enemy.hp) * 1.2 +
        (getBoardPower(myUnits) - getBoardPower(enemyUnits)) * 0.6;
      return myAdvantage > 0 ? 8 + myAdvantage * 0.25 : 1;
    }

    default:
      return 0;
  }
}

function scoreCard(state: MatchState, owner: Owner, card: MatchCard, free = false) {
  const cost = getPlayCost(state, card, free);
  const base =
    card.kind === "character"
      ? (card.attack ?? 0) * 2.1 + (card.health ?? 0) * 1.35 + (card.passive ? 1.25 : 0)
      : card.kind === "effect"
        ? 4.8
        : card.kind === "tactic"
          ? 4.2
          : 3.8;

  const scripted = scoreScriptedEffect(state, owner, card);
  const spellBonus = card.spell?.steps?.length ? card.spell.steps.length * 0.5 : 0;

  return base + scripted + spellBonus + (free ? 3 : 0) - cost * 0.55;
}

function getBestCard(state: MatchState, owner: Owner, cards: MatchCard[], free = false) {
  return cards
    .filter((card) => canPlayCard(state, owner, card, free))
    .sort((left, right) => scoreCard(state, owner, right, free) - scoreCard(state, owner, left, free))[0] ?? null;
}

function getBestAttackTarget(state: MatchState, attacker: UnitState, owner: Owner) {
  const enemyOwner = getEnemyOwner(owner);
  const enemyBoard = getBoardUnits(state, enemyOwner);
  const enemySide = getSide(state, enemyOwner);
  const totalReadyAttack = getTotalReadyAttack(state, owner);

  if (!enemySide.shield && totalReadyAttack >= enemySide.hp) {
    return { kind: "hero" as const };
  }

  if (!enemySide.shield && attacker.attack >= enemySide.hp) {
    return { kind: "hero" as const };
  }

  const killable = enemyBoard
    .filter((unit) => unit.health <= attacker.attack)
    .sort((left, right) => (right.attack + right.health) - (left.attack + left.health));

  const safeKill = killable.find((unit) => unit.attack < attacker.health);
  if (safeKill) {
    return { kind: "unit" as const, unitId: safeKill.instanceId };
  }

  if (killable[0]) {
    return { kind: "unit" as const, unitId: killable[0].instanceId };
  }

  const mostDangerous = enemyBoard
    .slice()
    .sort((left, right) => (right.attack * 2 + right.health) - (left.attack * 2 + left.health))[0];

  if (enemySide.shield && attacker.attack <= enemySide.shield.maxBlockedDamage && mostDangerous) {
    return { kind: "unit" as const, unitId: mostDangerous.instanceId };
  }

  if (mostDangerous && mostDangerous.attack >= attacker.health) {
    return { kind: "unit" as const, unitId: mostDangerous.instanceId };
  }

  return { kind: "hero" as const };
}

function findBlindCard(state: MatchState, instanceId: string) {
  const enemySide = state.player;
  return (
    enemySide.deck.find((card) => card.instanceId === instanceId) ??
    state.sharedDeck.cards.find((card) => card.instanceId === instanceId) ??
    null
  );
}

function chooseBestRevealCardForDragonEye(state: MatchState) {
  const cards = state.reveal.dragonEye.cards;
  if (cards.length === 0) return null;

  return cards
    .slice()
    .sort((left, right) => scoreCard(state, "player", right, false) - scoreCard(state, "player", left, false))[0] ?? null;
}

function chooseBestRevealCardForOracle(state: MatchState) {
  const cards = state.reveal.oracle.cards;
  if (cards.length === 0) return null;

  return cards
    .slice()
    .sort((left, right) => scoreCard(state, "ai", right, false) - scoreCard(state, "ai", left, false))[0] ?? null;
}

export function getNextAiAction(state: MatchState): MatchAction {
  const owner: Owner = "ai";

  if (state.winner) {
    return { type: "END_TURN", owner };
  }

  if (state.activePlayer !== owner) {
    return { type: "END_TURN", owner };
  }

  if (state.phase === "turn_intro") {
    return {
      type: "APPLY_ROLL",
      owner,
      roll: Math.floor(Math.random() * 20) + 1,
    };
  }

  if (state.reveal.dragonEye.active && state.reveal.dragonEye.viewer === owner) {
    if (state.reveal.dragonEye.cards.length === 0) {
      return { type: "CLOSE_DRAGON_EYE", owner };
    }

    const bestCard = chooseBestRevealCardForDragonEye(state);
    if (!bestCard) {
      return { type: "CLOSE_DRAGON_EYE", owner };
    }

    if (state.reveal.dragonEye.selectedCardInstanceId !== bestCard.instanceId) {
      return {
        type: "SELECT_DRAGON_EYE_CARD",
        owner,
        cardInstanceId: bestCard.instanceId,
      };
    }

    return { type: "CLOSE_DRAGON_EYE", owner };
  }

  if (state.reveal.oracle.active && state.reveal.oracle.viewer === owner) {
    if (state.reveal.oracle.cards.length === 0) {
      return { type: "CLOSE_ORACLE", owner };
    }

    const bestCard = chooseBestRevealCardForOracle(state);
    if (!bestCard) {
      return { type: "CLOSE_ORACLE", owner };
    }

    if (state.reveal.oracle.selectedCardInstanceId !== bestCard.instanceId) {
      return {
        type: "SELECT_ORACLE_CARD",
        owner,
        cardInstanceId: bestCard.instanceId,
      };
    }

    if (
      canStillPlay(state) &&
      canPlayCard(state, owner, bestCard, false) &&
      getOpenSlot(state, owner) !== -1
    ) {
      return {
        type: "PLAY_ORACLE_SELECTED",
        owner,
        slotIndex: getOpenSlot(state, owner),
      };
    }

    return { type: "CLOSE_ORACLE", owner };
  }

  if (state.phase !== "ai_turn") {
    return { type: "END_TURN", owner };
  }

  const side = getSide(state, owner);
  const openSlot = getOpenSlot(state, owner);

  if (canStillPlay(state) && openSlot !== -1) {
    if (state.turn.awakeningFreePlayAvailable) {
      const bestFreeFromHand = getBestCard(state, owner, side.hand, true);
      const bestFreeFromGrave = getBestCard(state, owner, side.graveyard, true);

      const bestFree =
        !bestFreeFromHand
          ? bestFreeFromGrave
          : !bestFreeFromGrave
            ? bestFreeFromHand
            : scoreCard(state, owner, bestFreeFromHand, true) >= scoreCard(state, owner, bestFreeFromGrave, true)
              ? bestFreeFromHand
              : bestFreeFromGrave;

      if (bestFree) {
        const source = side.hand.some((card) => card.instanceId === bestFree.instanceId) ? "hand" : "graveyard";
        return {
          type: "PLAY_CARD",
          owner,
          source,
          cardInstanceId: bestFree.instanceId,
          slotIndex: openSlot,
          free: true,
        };
      }

      if (state.turn.awakeningPassiveAvailable) {
        return { type: "USE_AWAKENING_PASSIVE", owner };
      }
    }

    if (state.turn.enemyDeckPlayCardId) {
      const blindCard = findBlindCard(state, state.turn.enemyDeckPlayCardId);
      if (blindCard && canPlayCard(state, owner, blindCard, false)) {
        return {
          type: "PLAY_CARD",
          owner,
          source: "enemy_deck",
          cardInstanceId: blindCard.instanceId,
          slotIndex: openSlot,
        };
      }
    }

    if (state.turn.graveyardPlayAvailable) {
      const bestGrave = getBestCard(state, owner, side.graveyard, false);
      if (bestGrave) {
        return {
          type: "PLAY_CARD",
          owner,
          source: "graveyard",
          cardInstanceId: bestGrave.instanceId,
          slotIndex: openSlot,
        };
      }
    }

    const bestHandCard = getBestCard(state, owner, side.hand, false);
    if (bestHandCard) {
      return {
        type: "PLAY_CARD",
        owner,
        source: "hand",
        cardInstanceId: bestHandCard.instanceId,
        slotIndex: openSlot,
      };
    }
  }

  const readyAttacker = getReadyUnits(state, owner)
    .sort((left, right) => (right.attack * 2 + right.health) - (left.attack * 2 + left.health))[0];

  if (readyAttacker) {
    return {
      type: "ATTACK",
      owner,
      attackerId: readyAttacker.instanceId,
      target: getBestAttackTarget(state, readyAttacker, owner),
    };
  }

  if (state.turn.awakeningPassiveAvailable) {
    return { type: "USE_AWAKENING_PASSIVE", owner };
  }

  return { type: "END_TURN", owner };
}