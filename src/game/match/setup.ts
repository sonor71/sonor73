import type { OwnedCard } from "../../useGameStore";
import { createMatchCardFromOwned, createStarterDeck } from "./catalog";
import {
  MATCH_BOARD_SIZE,
  type MatchCard,
  type MatchState,
  type PlayerState,
} from "./types";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function makeEmptyBoard() {
  return Array.from({ length: MATCH_BOARD_SIZE }, () => null);
}

function buildPlayerDeck(ownedCards: OwnedCard[], deckIds: string[]): MatchCard[] {
  const selectedIds = new Set(deckIds);

  const selectedOwned = ownedCards
    .filter((card) => selectedIds.has(card.instanceId) || selectedIds.has(card.baseId))
    .map((card, index) =>
      createMatchCardFromOwned(card, `player_owned_${card.baseId}_${index}_${crypto.randomUUID()}`),
    );

  const fallbackDeck = createStarterDeck("player_fallback");

  const combined =
    selectedOwned.length > 0
      ? [...selectedOwned, ...fallbackDeck].slice(0, 20)
      : fallbackDeck.slice(0, 20);

  return shuffle(combined);
}

function buildAiDeck(): MatchCard[] {
  return shuffle(createStarterDeck("ai").slice(0, 20));
}

function splitOpeningHand(deck: MatchCard[], openingCount = 5) {
  return {
    hand: deck.slice(0, openingCount),
    deck: deck.slice(openingCount),
  };
}

function createPlayerState(
  owner: "player" | "ai",
  deck: MatchCard[],
  options?: { startingWill?: number },
): PlayerState {
  const { hand, deck: restDeck } = splitOpeningHand(deck, 5);

  return {
    owner,
    hp: 30,
    maxHp: 30,
    will: options?.startingWill ?? 0,
    maxWill: 5,
    deck: restDeck,
    hand,
    board: makeEmptyBoard(),
    graveyard: [],
    shield: null,
  };
}

export function createInitialMatch(ownedCards: OwnedCard[], deckIds: string[]): MatchState {
  const playerDeck = buildPlayerDeck(ownedCards, deckIds);
  const aiDeck = buildAiDeck();

  const player = createPlayerState("player", playerDeck, { startingWill: 1 });
  const ai = createPlayerState("ai", aiDeck, { startingWill: 0 });

  return {
    matchId: crypto.randomUUID(),
    phase: "turn_intro",
    activePlayer: "player",
    round: 1,

    player,
    ai,

    sharedDeck: {
      active: false,
      cards: [],
    },

    turn: {
      round: 1,
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
      pendingRollOwner: "player",
      rollResolved: false,
      doubleSpeedAppliedThisTurn: false,
    },

    timer: {
      enabled: true,
      totalSecondsLeft: 900,
      turnSecondsLeft: 45,
      turnDurationSeconds: 45,
      speedMultiplier: 1,
    },

    reveal: {
      dragonEye: {
        active: false,
        viewer: null,
        targetOwner: null,
        cards: [],
        selectedCardInstanceId: null,
        sourceCardInstanceId: null,
      },
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

    log: [
      {
        id: crypto.randomUUID(),
        text: "Матч начался. Игрок бросает D20.",
      },
    ],

    winner: null,
    passiveSilencedUntilRound: null,
  };
}