import { ROULETTE_EVENTS } from "./catalog";
import {
  MATCH_HAND_SIZE,
  type AttackTarget,
  type BoardState,
  type EffectStep,
  type MatchAction,
  type MatchCard,
  type MatchLogEntry,
  type MatchState,
  type Owner,
  type PlayCardSource,
  type PlayerState,
  type ScriptedCardEffectKey,
  type UnitState,
} from "./types";

function makeLog(text: string): MatchLogEntry {
  return { id: crypto.randomUUID(), text };
}

function addLog(state: MatchState, text: string): MatchState {
  return { ...state, log: [...state.log, makeLog(text)] };
}

function getSide(state: MatchState, owner: Owner): PlayerState {
  return owner === "player" ? state.player : state.ai;
}

function getEnemyOwner(owner: Owner): Owner {
  return owner === "player" ? "ai" : "player";
}

function setSide(state: MatchState, owner: Owner, side: PlayerState): MatchState {
  return owner === "player" ? { ...state, player: side } : { ...state, ai: side };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function sampleCards<T>(items: T[], amount: number): T[] {
  return shuffle(items).slice(0, amount);
}

function isPassiveSilenced(state: MatchState) {
  return state.passiveSilencedUntilRound === state.round;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getPlayCost(state: MatchState, card: MatchCard, free = false) {
  return free ? 0 : card.willCost * state.turn.willMultiplier;
}

function canStillPlay(state: MatchState) {
  return state.turn.playLimit === null || state.turn.playsMade < state.turn.playLimit;
}

function markTurnCardPlayed(state: MatchState): MatchState {
  return {
    ...state,
    turn: {
      ...state.turn,
      playsMade: state.turn.playsMade + 1,
      playedAnyCard: true,
    },
  };
}

function adjustHeroHp(side: PlayerState, delta: number): PlayerState {
  return { ...side, hp: clamp(side.hp + delta, -999, side.maxHp) };
}

function adjustWill(side: PlayerState, delta: number): PlayerState {
  return { ...side, will: clamp(side.will + delta, 0, side.maxWill) };
}

function moveCardToGraveyard(side: PlayerState, card: MatchCard): PlayerState {
  return { ...side, graveyard: [...side.graveyard, card] };
}

function getBoardUnits(board: BoardState): UnitState[] {
  return board.filter((unit): unit is UnitState => unit !== null);
}

function getOpenBoardSlot(board: BoardState) {
  return board.findIndex((entry) => entry === null);
}

function hasOpenBoardSlot(board: BoardState) {
  return getOpenBoardSlot(board) !== -1;
}

function updateBoardUnit(board: BoardState, unitId: string, updater: (unit: UnitState) => UnitState): BoardState {
  return board.map((unit) => (unit && unit.instanceId === unitId ? updater(unit) : unit));
}

function resetDragonEyeReveal(state: MatchState): MatchState {
  return {
    ...state,
    reveal: {
      ...state.reveal,
      dragonEye: {
        active: false,
        viewer: null,
        targetOwner: null,
        cards: [],
        selectedCardInstanceId: null,
        sourceCardInstanceId: null,
      },
    },
  };
}

function resetOracleReveal(state: MatchState): MatchState {
  return {
    ...state,
    reveal: {
      ...state.reveal,
      oracle: {
        active: false,
        viewer: null,
        targetOwner: null,
        cards: [],
        selectedCardInstanceId: null,
        sourceCardInstanceId: null,
        allowPlaySelectedCard: false,
      },
    },
  };
}

function clearAllReveals(state: MatchState): MatchState {
  return resetOracleReveal(resetDragonEyeReveal(state));
}

function createBoardCardFromMatchCard(card: MatchCard, owner: Owner, slotIndex: number, round: number): UnitState {
  return {
    instanceId: `board_${card.instanceId}_${slotIndex}_${crypto.randomUUID()}`,
    sourceCardInstanceId: card.instanceId,
    baseId: card.baseId,
    owner,
    name: card.name,
    kind: card.kind,
    frontSrc: card.frontSrc,
    description: card.description,
    rarity: card.rarity,
    willCost: card.willCost,
    attack: card.attack ?? 0,
    health: card.health ?? 1,
    maxHealth: card.health ?? 1,
    exhausted: true,
    slotIndex,
    passive: card.passive,
    spell: card.spell,
    scriptedEffectKey: card.scriptedEffectKey,
    passiveTriggersUsed: 0,
    enteredAtRound: round,
  };
}

function drawCards(state: MatchState, owner: Owner, amount: number): MatchState {
  if (amount <= 0) return state;

  let nextState = state;
  let nextSide = getSide(nextState, owner);

  for (let count = 0; count < amount; count += 1) {
    if (nextSide.hand.length >= MATCH_HAND_SIZE) break;

    if (nextState.sharedDeck.active) {
      if (nextState.sharedDeck.cards.length === 0) break;
      const card = nextState.sharedDeck.cards[0];
      nextState = {
        ...nextState,
        sharedDeck: {
          ...nextState.sharedDeck,
          cards: nextState.sharedDeck.cards.slice(1),
        },
      };
      nextSide = getSide(nextState, owner);
      nextSide = { ...nextSide, hand: [...nextSide.hand, card] };
      nextState = setSide(nextState, owner, nextSide);
      continue;
    }

    if (nextSide.deck.length === 0) break;
    const card = nextSide.deck[0];
    nextSide = {
      ...nextSide,
      deck: nextSide.deck.slice(1),
      hand: [...nextSide.hand, card],
    };
    nextState = setSide(nextState, owner, nextSide);
  }

  return nextState;
}

function drawToHandLimit(state: MatchState, owner: Owner, limit: number): MatchState {
  const side = getSide(state, owner);
  const need = Math.max(0, limit - side.hand.length);
  return drawCards(state, owner, need);
}

function findCardInSource(
  state: MatchState,
  owner: Owner,
  source: PlayCardSource,
  cardInstanceId: string,
) {
  if (source === "hand") {
    return getSide(state, owner).hand.find((card) => card.instanceId === cardInstanceId) ?? null;
  }

  if (source === "graveyard") {
    return getSide(state, owner).graveyard.find((card) => card.instanceId === cardInstanceId) ?? null;
  }

  if (source === "enemy_deck") {
    const enemyOwner = getEnemyOwner(owner);
    const enemySide = getSide(state, enemyOwner);
    const fromEnemyDeck = enemySide.deck.find((card) => card.instanceId === cardInstanceId);
    if (fromEnemyDeck) return fromEnemyDeck;
    return state.sharedDeck.cards.find((card) => card.instanceId === cardInstanceId) ?? null;
  }

  if (source === "oracle") {
    return state.reveal.oracle.cards.find((card) => card.instanceId === cardInstanceId) ?? null;
  }

  return null;
}

function removeCardFromSource(
  state: MatchState,
  owner: Owner,
  source: PlayCardSource,
  cardInstanceId: string,
): MatchState {
  if (source === "hand") {
    const side = getSide(state, owner);
    return setSide(state, owner, {
      ...side,
      hand: side.hand.filter((card) => card.instanceId !== cardInstanceId),
    });
  }

  if (source === "graveyard") {
    const side = getSide(state, owner);
    return setSide(state, owner, {
      ...side,
      graveyard: side.graveyard.filter((card) => card.instanceId !== cardInstanceId),
    });
  }

  if (source === "enemy_deck") {
    const enemyOwner = getEnemyOwner(owner);
    const enemySide = getSide(state, enemyOwner);
    const enemyHasCard = enemySide.deck.some((card) => card.instanceId === cardInstanceId);

    if (enemyHasCard) {
      return setSide(state, enemyOwner, {
        ...enemySide,
        deck: enemySide.deck.filter((card) => card.instanceId !== cardInstanceId),
      });
    }

    return {
      ...state,
      sharedDeck: {
        ...state.sharedDeck,
        cards: state.sharedDeck.cards.filter((card) => card.instanceId !== cardInstanceId),
      },
    };
  }

  if (source === "oracle") {
    const targetOwner = state.reveal.oracle.targetOwner;
    if (!targetOwner) return state;

    const targetSide = getSide(state, targetOwner);
    const withoutHandCard = setSide(state, targetOwner, {
      ...targetSide,
      hand: targetSide.hand.filter((card) => card.instanceId !== cardInstanceId),
    });

    return {
      ...withoutHandCard,
      reveal: {
        ...withoutHandCard.reveal,
        oracle: {
          ...withoutHandCard.reveal.oracle,
          cards: withoutHandCard.reveal.oracle.cards.filter((card) => card.instanceId !== cardInstanceId),
          selectedCardInstanceId:
            withoutHandCard.reveal.oracle.selectedCardInstanceId === cardInstanceId
              ? null
              : withoutHandCard.reveal.oracle.selectedCardInstanceId,
        },
      },
    };
  }

  return state;
}

function applyHeroDamage(state: MatchState, targetOwner: Owner, amount: number, reason: string): MatchState {
  if (amount <= 0) return state;

  const side = getSide(state, targetOwner);
  if (side.shield && amount <= side.shield.maxBlockedDamage) {
    return addLog(
      state,
      `${reason}: щит ${targetOwner} блокирует ${amount} урона (лимит ${side.shield.maxBlockedDamage}).`,
    );
  }

  const nextState = setSide(state, targetOwner, adjustHeroHp(side, -amount));
  return addLog(nextState, `${reason}: ${targetOwner} получает ${amount} урона.`);
}

function healHero(state: MatchState, targetOwner: Owner, amount: number, reason: string): MatchState {
  if (amount <= 0) return state;
  const side = getSide(state, targetOwner);
  const healedSide = { ...side, hp: clamp(side.hp + amount, -999, side.maxHp) };
  return addLog(setSide(state, targetOwner, healedSide), `${reason}: ${targetOwner} восстанавливает ${amount} HP.`);
}

function applySteps(
  state: MatchState,
  owner: Owner,
  steps: EffectStep[],
  unitInstanceId?: string,
): MatchState {
  let nextState = state;

  for (const step of steps) {
    switch (step.kind) {
      case "damage_hero": {
        const targetOwner = step.target === "self" ? owner : getEnemyOwner(owner);
        nextState = applyHeroDamage(nextState, targetOwner, step.amount, "Эффект карты");
        break;
      }

      case "heal_hero": {
        const targetOwner = step.target === "self" ? owner : getEnemyOwner(owner);
        nextState = healHero(nextState, targetOwner, step.amount, "Эффект карты");
        break;
      }

      case "draw_cards": {
        nextState = drawCards(nextState, owner, step.amount);
        break;
      }

      case "gain_will": {
        const side = adjustWill(getSide(nextState, owner), step.amount);
        nextState = setSide(nextState, owner, side);
        break;
      }

      case "buff_board": {
        const side = getSide(nextState, owner);
        const board = side.board.map((unit) =>
          unit
            ? {
                ...unit,
                attack: unit.attack + step.attack,
                health: unit.health + step.health,
                maxHealth: unit.maxHealth + step.health,
              }
            : null,
        );
        nextState = setSide(nextState, owner, { ...side, board });
        break;
      }

      case "damage_all_units": {
        if (step.target === "all") {
          const playerSide = getSide(nextState, "player");
          const aiSide = getSide(nextState, "ai");
          nextState = {
            ...nextState,
            player: {
              ...playerSide,
              board: playerSide.board.map((unit) => (unit ? { ...unit, health: unit.health - step.amount } : null)),
            },
            ai: {
              ...aiSide,
              board: aiSide.board.map((unit) => (unit ? { ...unit, health: unit.health - step.amount } : null)),
            },
          };
        } else {
          const targetOwner = getEnemyOwner(owner);
          const targetSide = getSide(nextState, targetOwner);
          nextState = setSide(nextState, targetOwner, {
            ...targetSide,
            board: targetSide.board.map((unit) => (unit ? { ...unit, health: unit.health - step.amount } : null)),
          });
        }
        nextState = cleanupDeadUnits(nextState);
        break;
      }

      case "buff_self": {
        if (!unitInstanceId) break;
        const side = getSide(nextState, owner);
        nextState = setSide(nextState, owner, {
          ...side,
          board: updateBoardUnit(side.board, unitInstanceId, (unit) => ({
            ...unit,
            attack: unit.attack + step.attack,
            health: unit.health + step.health,
            maxHealth: unit.maxHealth + step.health,
          })),
        });
        break;
      }

      default:
        break;
    }
  }

  return nextState;
}

function applyScriptedCardEffect(
  state: MatchState,
  owner: Owner,
  card: MatchCard,
  unitInstanceId?: string,
): MatchState {
  const key = card.scriptedEffectKey;
  if (!key) return state;

  let nextState = state;
  const enemyOwner = getEnemyOwner(owner);

  const logUse = (text: string) => addLog(nextState, `${card.name}: ${text}`);

  const openDragonEye = () => {
    const enemyDeck = [...getSide(nextState, enemyOwner).deck];
    nextState = {
      ...nextState,
      reveal: {
        ...nextState.reveal,
        dragonEye: {
          active: true,
          viewer: owner,
          targetOwner: enemyOwner,
          cards: enemyDeck,
          selectedCardInstanceId: enemyDeck[0]?.instanceId ?? null,
          sourceCardInstanceId: card.instanceId,
        },
      },
    };
    return logUse(enemyDeck.length > 0 ? "открывает колоду противника." : "колода противника пуста.");
  };

  const openOracle = () => {
    const enemyHand = [...getSide(nextState, enemyOwner).hand];
    const revealed = sampleCards(enemyHand, 3);
    nextState = {
      ...nextState,
      reveal: {
        ...nextState.reveal,
        oracle: {
          active: true,
          viewer: owner,
          targetOwner: enemyOwner,
          cards: revealed,
          selectedCardInstanceId: revealed[0]?.instanceId ?? null,
          sourceCardInstanceId: card.instanceId,
          allowPlaySelectedCard: revealed.length > 0,
        },
      },
    };
    return logUse(revealed.length > 0 ? "показывает 3 карты из руки противника." : "у противника нет карт в руке.");
  };

  switch (key as ScriptedCardEffectKey) {
    case "reverse_heart": {
      const mySide = getSide(nextState, owner);
      const enemySide = getSide(nextState, enemyOwner);
      nextState = setSide(nextState, owner, { ...mySide, hp: enemySide.hp });
      nextState = setSide(nextState, enemyOwner, { ...enemySide, hp: mySide.hp });
      nextState = addLog(nextState, `${card.name}: HP героев меняются местами.`);
      break;
    }

    case "dragon_eye": {
      nextState = openDragonEye();
      break;
    }

    case "oracle": {
      nextState = openOracle();
      break;
    }

    case "sandstorm": {
      nextState = applyHeroDamage(nextState, enemyOwner, 3, card.name);
      break;
    }

    case "energy_sword": {
      nextState = applyHeroDamage(nextState, enemyOwner, 4, card.name);
      break;
    }

    case "shadow_sword": {
      nextState = applyHeroDamage(nextState, enemyOwner, 2, card.name);
      break;
    }

    case "tree_of_life": {
      nextState = healHero(nextState, owner, 6, card.name);
      break;
    }

    case "shield_of_hope": {
      const side = getSide(nextState, owner);
      nextState = setSide(nextState, owner, {
        ...side,
        shield: {
          maxBlockedDamage: 3,
          turnsLeft: 2,
        },
      });
      nextState = addLog(nextState, `${card.name}: щит блокирует урон до 3 на 2 твоих хода.`);
      break;
    }

    case "double_speed": {
      nextState = {
        ...nextState,
        timer: {
          ...nextState.timer,
          speedMultiplier: Math.max(2, nextState.timer.speedMultiplier),
        },
        turn: {
          ...nextState.turn,
          doubleSpeedAppliedThisTurn: true,
        },
      };
      nextState = addLog(nextState, `${card.name}: таймер матча ускорен x2.`);
      break;
    }

    default:
      break;
  }

  if (card.spell?.steps?.length) {
    nextState = applySteps(nextState, owner, card.spell.steps, unitInstanceId);
  }

  return cleanupDeadUnits(checkWinner(nextState));
}

function cleanupDeadUnits(state: MatchState): MatchState {
  let nextState = state;

  for (const owner of ["player", "ai"] as const) {
    const side = getSide(nextState, owner);
    const dead = getBoardUnits(side.board).filter((unit) => unit.health <= 0);
    if (dead.length === 0) continue;

    const board = side.board.map((unit) => (unit && unit.health <= 0 ? null : unit));
    const graveyardCards: MatchCard[] = dead.map((unit) => ({
      instanceId: unit.sourceCardInstanceId,
      baseId: unit.baseId,
      name: unit.name,
      kind: unit.kind,
      willCost: unit.willCost,
      attack: unit.attack,
      health: unit.maxHealth,
      rarity: unit.rarity,
      description: unit.description,
      frontSrc: unit.frontSrc,
      passive: unit.passive,
      spell: unit.spell,
      scriptedEffectKey: unit.scriptedEffectKey,
    }));

    nextState = setSide(nextState, owner, {
      ...side,
      board,
      graveyard: [...side.graveyard, ...graveyardCards],
    });

    dead.forEach((unit) => {
      nextState = addLog(nextState, `${unit.name} (${owner}) отправляется в сброс.`);
    });
  }

  return nextState;
}

function checkWinner(state: MatchState): MatchState {
  const playerDead = state.player.hp <= 0;
  const aiDead = state.ai.hp <= 0;

  if (!playerDead && !aiDead) return state;

  let winner: Owner;
  if (playerDead && aiDead) {
    winner = state.activePlayer;
  } else {
    winner = playerDead ? "ai" : "player";
  }

  return {
    ...state,
    phase: "finished",
    winner,
  };
}

function triggerUnitPassive(state: MatchState, owner: Owner, unitId: string, reason: string): MatchState {
  if (isPassiveSilenced(state)) {
    return addLog(state, `Пассивка подавлена эффектом «Тишина Сфер» (${reason}).`);
  }

  const side = getSide(state, owner);
  const unit = getBoardUnits(side.board).find((entry) => entry.instanceId === unitId);
  if (!unit?.passive) return state;

  let nextState = addLog(state, `${unit.name} активирует пассивку «${unit.passive.name}».`);
  nextState = applySteps(nextState, owner, unit.passive.steps, unitId);

  const refreshedSide = getSide(nextState, owner);
  nextState = setSide(nextState, owner, {
    ...refreshedSide,
    board: updateBoardUnit(refreshedSide.board, unitId, (entry) => ({
      ...entry,
      passiveTriggersUsed: entry.passiveTriggersUsed + 1,
    })),
  });

  return cleanupDeadUnits(checkWinner(nextState));
}

function resolveCardPlay(
  state: MatchState,
  owner: Owner,
  source: PlayCardSource,
  cardInstanceId: string,
  slotIndex: number | undefined,
  free: boolean,
  countsTowardTurn: boolean,
): MatchState {
  const card = findCardInSource(state, owner, source, cardInstanceId);
  if (!card) return state;
  if (countsTowardTurn && !canStillPlay(state)) return state;
  if (state.winner) return state;
  if (state.activePlayer !== owner) return state;

  const side = getSide(state, owner);
  const cost = getPlayCost(state, card, free);
  if (side.will < cost) return state;

  const resolvedSlotIndex = slotIndex ?? getOpenBoardSlot(side.board);
  if (resolvedSlotIndex === -1 || resolvedSlotIndex === undefined) return state;
  if (resolvedSlotIndex < 0 || resolvedSlotIndex >= side.board.length) return state;
  if (side.board[resolvedSlotIndex] !== null) return state;

  if (source === "graveyard" && !state.turn.graveyardPlayAvailable && !free) return state;
  if (source === "enemy_deck" && state.turn.enemyDeckPlayCardId !== card.instanceId) return state;
  if (source === "oracle") {
    if (!state.reveal.oracle.active || state.reveal.oracle.viewer !== owner) return state;
    if (state.reveal.oracle.selectedCardInstanceId !== card.instanceId) return state;
  }
  if (free && !state.turn.awakeningFreePlayAvailable) return state;

  let nextState = removeCardFromSource(state, owner, source, card.instanceId);
  let nextSide = getSide(nextState, owner);
  nextSide = adjustWill(nextSide, -cost);
  nextState = setSide(nextState, owner, nextSide);

  const placementIndex = resolvedSlotIndex;
  const boardCard = createBoardCardFromMatchCard(card, owner, placementIndex, nextState.round);

  nextSide = getSide(nextState, owner);
  const board = [...nextSide.board];
  board[placementIndex] = boardCard;

  nextState = setSide(nextState, owner, {
    ...nextSide,
    board,
  });

  nextState = addLog(nextState, `${owner} разыгрывает ${card.name} в слот ${placementIndex + 1}.`);

  nextState = applyScriptedCardEffect(nextState, owner, card, boardCard.instanceId);

  if (card.passive) {
    nextState = triggerUnitPassive(nextState, owner, boardCard.instanceId, "при входе на поле");
  }

  nextState = {
    ...nextState,
    turn: {
      ...nextState.turn,
      graveyardPlayAvailable: source === "graveyard" ? false : nextState.turn.graveyardPlayAvailable,
      enemyDeckPlayCardId: source === "enemy_deck" ? null : nextState.turn.enemyDeckPlayCardId,
      awakeningFreePlayAvailable: free ? false : nextState.turn.awakeningFreePlayAvailable,
      awakeningPassiveAvailable: free ? false : nextState.turn.awakeningPassiveAvailable,
    },
  };

  if (source === "oracle") {
    nextState = resetOracleReveal(nextState);
  }

  if (countsTowardTurn) {
    nextState = markTurnCardPlayed(nextState);
  }

  return cleanupDeadUnits(checkWinner(nextState));
}

function moveRandomGraveCardToHand(state: MatchState, owner: Owner): MatchState {
  const side = getSide(state, owner);
  if (side.graveyard.length === 0) return addLog(state, `У ${owner} нет карты в сбросе для возврата.`);
  if (side.hand.length >= MATCH_HAND_SIZE) return addLog(state, `У ${owner} уже полная рука.`);

  const randomIndex = Math.floor(Math.random() * side.graveyard.length);
  const card = side.graveyard[randomIndex];
  const updatedSide: PlayerState = {
    ...side,
    graveyard: side.graveyard.filter((entry) => entry.instanceId !== card.instanceId),
    hand: [...side.hand, card],
  };

  return addLog(setSide(state, owner, updatedSide), `${owner} возвращает ${card.name} из сброса в руку.`);
}

function getBlindEnemyDeckCardId(state: MatchState, owner: Owner): string | null {
  const enemyOwner = getEnemyOwner(owner);
  const enemySide = getSide(state, enemyOwner);
  if (enemySide.deck.length > 0) {
    return enemySide.deck[Math.floor(Math.random() * enemySide.deck.length)].instanceId;
  }
  if (state.sharedDeck.active && state.sharedDeck.cards.length > 0) {
    return state.sharedDeck.cards[Math.floor(Math.random() * state.sharedDeck.cards.length)].instanceId;
  }
  return null;
}

function tryAutoPlayTopDeckCard(state: MatchState, owner: Owner): MatchState {
  const side = getSide(state, owner);
  const card = state.sharedDeck.active ? state.sharedDeck.cards[0] : side.deck[0];
  if (!card) {
    return addLog(state, `Зов Эха: у ${owner} нет карты для автопроигрывания.`);
  }

  if (!hasOpenBoardSlot(side.board)) {
    return addLog(state, `Зов Эха: ${owner} не может сыграть ${card.name}, поле заполнено.`);
  }

  const cost = getPlayCost(state, card, false);
  if (side.will < cost) {
    return addLog(state, `Зов Эха: ${owner} не хватает Воли на ${card.name}.`);
  }

  if (state.sharedDeck.active) {
    const working = {
      ...state,
      turn: {
        ...state.turn,
        enemyDeckPlayCardId: card.instanceId,
      },
    };
    return resolveCardPlay(working, owner, "enemy_deck", card.instanceId, undefined, false, owner === state.activePlayer);
  }

  const updatedSide: PlayerState = {
    ...side,
    hand: [card, ...side.hand],
    deck: side.deck.slice(1),
  };
  let working = setSide(state, owner, updatedSide);
  working = addLog(working, `Зов Эха раскрывает верхнюю карту ${owner}.`);
  return resolveCardPlay(working, owner, "hand", card.instanceId, undefined, false, owner === state.activePlayer);
}

function countEffectCards(side: PlayerState) {
  const boardEffects = getBoardUnits(side.board).filter((card) => card.kind === "effect").length;
  const handEffects = side.hand.filter((card) => card.kind === "effect").length;
  const graveyardEffects = side.graveyard.filter((card) => card.kind === "effect").length;
  return boardEffects + handEffects + graveyardEffects;
}

function buffRandomFriendlyUnit(state: MatchState, owner: Owner): MatchState {
  const side = getSide(state, owner);
  const units = getBoardUnits(side.board);
  if (units.length === 0) return addLog(state, `У ${owner} нет карт на поле для усиления.`);
  const randomUnit = units[Math.floor(Math.random() * units.length)];
  const nextState = setSide(state, owner, {
    ...side,
    board: updateBoardUnit(side.board, randomUnit.instanceId, (unit) => ({
      ...unit,
      attack: unit.attack + 1,
      health: unit.health + 1,
      maxHealth: unit.maxHealth + 1,
    })),
  });
  return nextState;
}

function applyRouletteEvent(state: MatchState, owner: Owner, eventId: string): MatchState {
  let nextState = addLog(
    state,
    `Рулетка Судьбы активирует событие: ${ROULETTE_EVENTS.find((event) => event.id === eventId)?.title ?? eventId}.`,
  );

  switch (eventId) {
    case "deck_unity": {
      nextState = {
        ...nextState,
        sharedDeck: {
          active: true,
          cards: shuffle([
            ...nextState.sharedDeck.cards,
            ...nextState.player.deck,
            ...nextState.ai.deck,
          ]),
        },
        player: { ...nextState.player, deck: [] },
        ai: { ...nextState.ai, deck: [] },
      };
      return addLog(nextState, "Обе колоды объединены в общий пул добора.");
    }

    case "echo_call": {
      nextState = tryAutoPlayTopDeckCard(nextState, "player");
      nextState = tryAutoPlayTopDeckCard(nextState, "ai");
      return nextState;
    }

    case "eternal_pain": {
      const playerLoss = countEffectCards(nextState.player);
      const aiLoss = countEffectCards(nextState.ai);
      nextState = setSide(nextState, "player", adjustHeroHp(nextState.player, -playerLoss));
      nextState = setSide(nextState, "ai", adjustHeroHp(nextState.ai, -aiLoss));
      nextState = addLog(nextState, `Проклятие Вечной Боли: игрок теряет ${playerLoss} HP, ИИ теряет ${aiLoss} HP.`);
      return checkWinner(nextState);
    }

    case "sphere_silence": {
      return {
        ...nextState,
        passiveSilencedUntilRound: nextState.round,
      };
    }

    case "eternity_blessing": {
      return moveRandomGraveCardToHand(nextState, owner);
    }

    case "blood_tithe": {
      nextState = setSide(nextState, "player", adjustHeroHp(nextState.player, -2));
      nextState = setSide(nextState, "ai", adjustHeroHp(nextState.ai, -2));
      return checkWinner(addLog(nextState, "Оба героя теряют по 2 HP."));
    }

    case "lucky_stream":
      return addLog(drawCards(nextState, owner, 2), `${owner} добирает 2 карты.`);

    case "broken_hourglass": {
      const ownerSide = adjustWill(getSide(nextState, owner), 1);
      return addLog(setSide(nextState, owner, ownerSide), `${owner} восстанавливает 1 Волю.`);
    }

    case "ashen_rain":
      return addLog(
        applySteps(nextState, owner, [{ kind: "damage_all_units", target: "all", amount: 1 }]),
        "Пепельный дождь обрушивается на все карты на поле.",
      );

    case "mirror_flare": {
      nextState = setSide(nextState, "player", { ...nextState.player, hp: clamp(nextState.player.hp + 1, -999, nextState.player.maxHp) });
      nextState = setSide(nextState, "ai", { ...nextState.ai, hp: clamp(nextState.ai.hp + 1, -999, nextState.ai.maxHp) });
      return addLog(nextState, "Оба героя восстанавливают по 1 HP.");
    }

    case "rage_of_void":
      return addLog(
        applySteps(nextState, owner, [{ kind: "buff_board", target: "friendly", attack: 1, health: 0 }]),
        `${owner} получает Ярость Бездны.`,
      );

    case "iron_mercy": {
      const ownerSide = getSide(nextState, owner);
      return addLog(
        setSide(nextState, owner, { ...ownerSide, hp: clamp(ownerSide.hp + 3, -999, ownerSide.maxHp) }),
        `${owner} восстанавливает 3 HP.`,
      );
    }

    case "deep_memory":
      return moveRandomGraveCardToHand(nextState, owner);

    case "frayed_signal": {
      nextState = drawCards(nextState, "player", 1);
      nextState = drawCards(nextState, "ai", 1);
      return addLog(nextState, "Оба игрока добирают по 1 карте.");
    }

    case "cold_contract":
      return addLog(
        applySteps(nextState, owner, [{ kind: "damage_hero", target: "enemy", amount: 2 }]),
        `${owner} наносит 2 урона герою врага.`,
      );

    case "fading_echo":
      return addLog(buffRandomFriendlyUnit(nextState, owner), `${owner} усиливает случайную карту на поле.`);

    case "rift_whisper": {
      nextState = applySteps(nextState, owner, [
        { kind: "damage_hero", target: "enemy", amount: 1 },
        { kind: "gain_will", target: "self", amount: 1 },
      ]);
      return addLog(nextState, `${owner} слышит Шёпот Разлома.`);
    }

    case "moon_reserve": {
      nextState = setSide(nextState, "player", adjustWill(nextState.player, 1));
      nextState = setSide(nextState, "ai", adjustWill(nextState.ai, 1));
      return addLog(nextState, "Оба игрока получают по 1 Воле.");
    }

    case "glass_comet":
      return addLog(
        applySteps(nextState, owner, [{ kind: "damage_all_units", target: "enemy", amount: 1 }]),
        "Стеклянная комета бьёт по вражескому полю.",
      );

    case "last_oath": {
      nextState = drawCards(nextState, owner, 1);
      const side = getSide(nextState, owner);
      nextState = setSide(nextState, owner, { ...side, hp: clamp(side.hp + 1, -999, side.maxHp) });
      return addLog(nextState, `${owner} добирает карту и восстанавливает 1 HP.`);
    }

    default:
      return nextState;
  }
}

function hasPassiveToReactivate(state: MatchState, owner: Owner) {
  return getBoardUnits(getSide(state, owner).board).some((unit) => Boolean(unit.passive));
}

function applyRoll(state: MatchState, owner: Owner, roll: number): MatchState {
  if (state.phase !== "turn_intro" || state.activePlayer !== owner || state.winner) return state;

  let nextState: MatchState = {
    ...state,
    phase: owner === "player" ? "player_turn" : "ai_turn",
    turn: {
      ...state.turn,
      roll,
      playLimit: 1,
      playsMade: 0,
      playedAnyCard: false,
      willMultiplier: 1,
      graveyardPlayAvailable: false,
      enemyDeckPlayCardId: null,
      awakeningFreePlayAvailable: false,
      awakeningPassiveAvailable: false,
      rouletteEventId: null,
      pendingRollOwner: null,
      rollResolved: true,
      doubleSpeedAppliedThisTurn: false,
    },
    timer: {
      ...state.timer,
      turnSecondsLeft: state.timer.turnDurationSeconds,
    },
  };

  nextState = addLog(nextState, `${owner} бросает D20 и получает ${roll}.`);

  if (roll >= 1 && roll <= 10) {
    nextState = addLog(
      {
        ...nextState,
        turn: { ...nextState.turn, playLimit: roll },
      },
      `Лимит карт на ход: ${roll}.`,
    );
  } else if (roll >= 11 && roll <= 14) {
    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        playLimit: 1,
        graveyardPlayAvailable: getSide(nextState, owner).graveyard.length > 0,
      },
    };
    nextState = addLog(nextState, "Можно сыграть 1 карту из своего сброса.");
  } else if (roll >= 15 && roll <= 16) {
    const event = ROULETTE_EVENTS[Math.floor(Math.random() * ROULETTE_EVENTS.length)];
    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        playLimit: 1,
        rouletteEventId: event.id,
      },
    };
    nextState = applyRouletteEvent(nextState, owner, event.id);
  } else if (roll >= 17 && roll <= 18) {
    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        playLimit: null,
        willMultiplier: 2,
      },
    };
    nextState = addLog(nextState, "Можно сыграть любое количество карт, но стоимость по Воле удваивается.");
  } else if (roll === 19) {
    const enemyDeckPlayCardId = getBlindEnemyDeckCardId(nextState, owner);
    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        playLimit: 1,
        enemyDeckPlayCardId,
      },
    };
    nextState = addLog(
      nextState,
      enemyDeckPlayCardId
        ? "Можно сыграть одну случайную карту из колоды противника вслепую."
        : "У противника нет доступной карты в колоде.",
    );
  } else if (roll === 20) {
    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        playLimit: 1,
        awakeningFreePlayAvailable: true,
        awakeningPassiveAvailable: hasPassiveToReactivate(nextState, owner),
      },
    };
    nextState = addLog(nextState, "Пробуждение: сыграй 1 карту бесплатно или повторно активируй пассивку.");
  }

  return checkWinner(nextState);
}

function performAttack(
  state: MatchState,
  owner: Owner,
  attackerId: string,
  target: AttackTarget,
): MatchState {
  if (state.winner || state.activePlayer !== owner || (owner === "player" ? state.phase !== "player_turn" : state.phase !== "ai_turn")) {
    return state;
  }

  const side = getSide(state, owner);
  const attacker = getBoardUnits(side.board).find((unit) => unit.instanceId === attackerId);
  if (!attacker || attacker.exhausted || attacker.attack <= 0) return state;

  let nextState = state;

  if (target.kind === "hero") {
    const enemyOwner = getEnemyOwner(owner);
    nextState = applyHeroDamage(nextState, enemyOwner, attacker.attack, `${attacker.name} атакует героя`);
  } else {
    const enemyOwner = getEnemyOwner(owner);
    const enemySide = getSide(nextState, enemyOwner);
    const defender = getBoardUnits(enemySide.board).find((unit) => unit.instanceId === target.unitId);
    if (!defender) return state;

    const updatedAttackerBoard = updateBoardUnit(side.board, attackerId, (unit) => ({
      ...unit,
      health: unit.health - defender.attack,
    }));
    const updatedDefenderBoard = updateBoardUnit(enemySide.board, defender.instanceId, (unit) => ({
      ...unit,
      health: unit.health - attacker.attack,
    }));

    nextState = setSide(nextState, owner, { ...side, board: updatedAttackerBoard });
    nextState = setSide(nextState, enemyOwner, { ...enemySide, board: updatedDefenderBoard });
    nextState = addLog(nextState, `${attacker.name} атакует ${defender.name}.`);
    nextState = cleanupDeadUnits(nextState);
  }

  const refreshedSide = getSide(nextState, owner);
  nextState = setSide(nextState, owner, {
    ...refreshedSide,
    board: updateBoardUnit(refreshedSide.board, attackerId, (unit) => ({ ...unit, exhausted: true })),
  });

  return checkWinner(nextState);
}

function decrementShieldForOwner(state: MatchState, owner: Owner): MatchState {
  const side = getSide(state, owner);
  if (!side.shield) return state;

  const turnsLeft = side.shield.turnsLeft - 1;
  const updatedSide = {
    ...side,
    shield: turnsLeft > 0 ? { ...side.shield, turnsLeft } : null,
  };

  let nextState = setSide(state, owner, updatedSide);
  if (turnsLeft <= 0) {
    nextState = addLog(nextState, `Щит ${owner} рассеивается.`);
  }
  return nextState;
}

function getWinnerByTimeout(state: MatchState): Owner {
  if (state.player.hp === state.ai.hp) {
    return state.activePlayer;
  }
  return state.player.hp > state.ai.hp ? "player" : "ai";
}

function forceTurnTimeout(state: MatchState): MatchState {
  if (state.phase === "finished") return state;
  let nextState = addLog(state, `Время ${state.activePlayer} истекло.`);
  nextState = endTurn(nextState, state.activePlayer);
  return nextState;
}

function tickTimer(state: MatchState, seconds: number): MatchState {
  if (state.phase === "finished" || !state.timer.enabled) return state;

  const delta = Math.max(1, seconds) * Math.max(1, state.timer.speedMultiplier);

  let nextState: MatchState = {
    ...state,
    timer: {
      ...state.timer,
      totalSecondsLeft: Math.max(0, state.timer.totalSecondsLeft - delta),
      turnSecondsLeft: Math.max(0, state.timer.turnSecondsLeft - delta),
    },
  };

  if (nextState.timer.totalSecondsLeft <= 0) {
    nextState = addLog(nextState, "Общее время матча истекло.");
    return {
      ...nextState,
      phase: "finished",
      winner: getWinnerByTimeout(nextState),
    };
  }

  if (nextState.timer.turnSecondsLeft <= 0) {
    return forceTurnTimeout(nextState);
  }

  return nextState;
}

function endTurn(state: MatchState, owner: Owner): MatchState {
  if (state.winner || state.activePlayer !== owner || state.phase === "finished") {
    return state;
  }

  let nextState = clearAllReveals(state);
  const activeSide = getSide(nextState, owner);

  if (!nextState.turn.playedAnyCard) {
    nextState = setSide(nextState, owner, adjustHeroHp(activeSide, -2));
    nextState = addLog(nextState, `${owner} не сыграл ни одной карты и теряет 2 HP.`);
  }

  nextState = drawToHandLimit(nextState, owner, MATCH_HAND_SIZE);

  const ownerAfterDraw = getSide(nextState, owner);
  const drawSourceEmpty = nextState.sharedDeck.active
    ? nextState.sharedDeck.cards.length === 0
    : ownerAfterDraw.deck.length === 0;

  if (drawSourceEmpty) {
    nextState = setSide(nextState, owner, adjustHeroHp(ownerAfterDraw, -1));
    nextState = addLog(nextState, `${owner} страдает от пустой колоды и теряет 1 HP.`);
  }

  nextState = checkWinner(nextState);
  if (nextState.phase === "finished") return nextState;

  const nextOwner = getEnemyOwner(owner);
  const nextRound = nextOwner === "player" ? nextState.round + 1 : nextState.round;

  nextState = decrementShieldForOwner(nextState, nextOwner);

  const nextSide = getSide(nextState, nextOwner);
  const readiedBoard = nextSide.board.map((unit) => (unit ? { ...unit, exhausted: false } : null));
  const restoredWill = Math.min(nextSide.maxWill, nextSide.will + 1);

  nextState = setSide(nextState, nextOwner, {
    ...nextSide,
    board: readiedBoard,
    will: restoredWill,
  });

  nextState = {
    ...nextState,
    activePlayer: nextOwner,
    phase: "turn_intro",
    round: nextRound,
    turn: {
      round: nextRound,
      roll: null,
      playLimit: 1,
      playsMade: 0,
      playedAnyCard: false,
      willMultiplier: 1,
      graveyardPlayAvailable: false,
      enemyDeckPlayCardId: null,
      awakeningFreePlayAvailable: false,
      awakeningPassiveAvailable: false,
      rouletteEventId: null,
      pendingRollOwner: nextOwner,
      rollResolved: false,
      doubleSpeedAppliedThisTurn: false,
    },
    timer: {
      ...nextState.timer,
      turnSecondsLeft: nextState.timer.turnDurationSeconds,
    },
  };

  return addLog(nextState, `Ход переходит к ${nextOwner}.`);
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case "APPLY_ROLL":
      return applyRoll(state, action.owner, action.roll);

    case "PLAY_CARD":
      return resolveCardPlay(
        state,
        action.owner,
        action.source,
        action.cardInstanceId,
        action.slotIndex,
        Boolean(action.free),
        true,
      );

    case "ATTACK":
      return performAttack(state, action.owner, action.attackerId, action.target);

    case "USE_AWAKENING_PASSIVE": {
      if (!state.turn.awakeningPassiveAvailable || state.activePlayer !== action.owner) return state;
      const targetUnit = getBoardUnits(getSide(state, action.owner).board).find((unit) => Boolean(unit.passive));
      if (!targetUnit) return addLog(state, `У ${action.owner} нет доступной пассивки для пробуждения.`);

      const nextState = {
        ...state,
        turn: {
          ...state.turn,
          awakeningFreePlayAvailable: false,
          awakeningPassiveAvailable: false,
        },
      };

      return triggerUnitPassive(nextState, action.owner, targetUnit.instanceId, "пробуждение");
    }

    case "SELECT_DRAGON_EYE_CARD": {
      if (!state.reveal.dragonEye.active || state.reveal.dragonEye.viewer !== action.owner) return state;
      if (!state.reveal.dragonEye.cards.some((card) => card.instanceId === action.cardInstanceId)) return state;

      return {
        ...state,
        reveal: {
          ...state.reveal,
          dragonEye: {
            ...state.reveal.dragonEye,
            selectedCardInstanceId: action.cardInstanceId,
          },
        },
      };
    }

    case "CLOSE_DRAGON_EYE":
      return state.reveal.dragonEye.viewer === action.owner ? resetDragonEyeReveal(state) : state;

    case "SELECT_ORACLE_CARD": {
      if (!state.reveal.oracle.active || state.reveal.oracle.viewer !== action.owner) return state;
      if (!state.reveal.oracle.cards.some((card) => card.instanceId === action.cardInstanceId)) return state;

      return {
        ...state,
        reveal: {
          ...state.reveal,
          oracle: {
            ...state.reveal.oracle,
            selectedCardInstanceId: action.cardInstanceId,
          },
        },
      };
    }

    case "PLAY_ORACLE_SELECTED": {
      if (!state.reveal.oracle.active || state.reveal.oracle.viewer !== action.owner) return state;
      const selectedId = state.reveal.oracle.selectedCardInstanceId;
      if (!selectedId) return state;

      return resolveCardPlay(
        state,
        action.owner,
        "oracle",
        selectedId,
        action.slotIndex,
        false,
        true,
      );
    }

    case "CLOSE_ORACLE":
      return state.reveal.oracle.viewer === action.owner ? resetOracleReveal(state) : state;

    case "TICK_TIMER":
      return tickTimer(state, action.seconds ?? 1);

    case "END_TURN":
      return endTurn(state, action.owner);

    default:
      return state;
  }
}