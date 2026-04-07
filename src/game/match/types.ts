export type Owner = "player" | "ai";
export type CardKind = "character" | "event" | "effect" | "tactic";
export type MatchPhase = "turn_intro" | "player_turn" | "ai_turn" | "finished";

export const MATCH_BOARD_SIZE = 6;
export const MATCH_HAND_SIZE = 10;

export type ScriptedCardEffectKey =
  | "reverse_heart"
  | "dragon_eye"
  | "oracle"
  | "sandstorm"
  | "energy_sword"
  | "shadow_sword"
  | "tree_of_life"
  | "shield_of_hope"
  | "double_speed";

export type EffectStep =
  | { kind: "damage_hero"; target: "self" | "enemy"; amount: number }
  | { kind: "heal_hero"; target: "self" | "enemy"; amount: number }
  | { kind: "draw_cards"; target: "self"; amount: number }
  | { kind: "gain_will"; target: "self"; amount: number }
  | { kind: "buff_board"; target: "friendly"; attack: number; health: number }
  | { kind: "damage_all_units"; target: "enemy" | "all"; amount: number }
  | { kind: "buff_self"; attack: number; health: number };

export interface PassiveDefinition {
  id: string;
  name: string;
  description: string;
  steps: EffectStep[];
  reusable?: boolean;
}

export interface SpellDefinition {
  id: string;
  description: string;
  steps: EffectStep[];
}

export interface CardTemplate {
  baseId: string;
  name: string;
  kind: CardKind;
  willCost: number;
  attack?: number;
  health?: number;
  rarity?: string;
  description: string;
  frontSrc: string;
  passive?: PassiveDefinition;
  spell?: SpellDefinition;
  scriptedEffectKey?: ScriptedCardEffectKey;
}

export interface MatchCard {
  instanceId: string;
  baseId: string;
  name: string;
  kind: CardKind;
  willCost: number;
  attack?: number;
  health?: number;
  rarity?: string;
  description: string;
  frontSrc: string;
  passive?: PassiveDefinition;
  spell?: SpellDefinition;
  scriptedEffectKey?: ScriptedCardEffectKey;
}

export interface HeroShieldState {
  maxBlockedDamage: number;
  turnsLeft: number;
}

export interface BoardCardState {
  instanceId: string;
  sourceCardInstanceId: string;
  baseId: string;
  owner: Owner;
  name: string;
  kind: CardKind;
  frontSrc: string;
  description: string;
  rarity?: string;
  willCost: number;
  attack: number;
  health: number;
  maxHealth: number;
  exhausted: boolean;
  slotIndex: number;
  passive?: PassiveDefinition;
  spell?: SpellDefinition;
  scriptedEffectKey?: ScriptedCardEffectKey;
  passiveTriggersUsed: number;
  enteredAtRound: number;
}

export type UnitState = BoardCardState;
export type BoardState = Array<BoardCardState | null>;

export interface PlayerState {
  owner: Owner;
  hp: number;
  maxHp: number;
  will: number;
  maxWill: number;
  deck: MatchCard[];
  hand: MatchCard[];
  board: BoardState;
  graveyard: MatchCard[];
  shield: HeroShieldState | null;
}

export interface TurnRules {
  round: number;
  roll: number | null;
  playLimit: number | null;
  playsMade: number;
  playedAnyCard: boolean;
  willMultiplier: number;
  graveyardPlayAvailable: boolean;
  enemyDeckPlayCardId: string | null;
  awakeningFreePlayAvailable: boolean;
  awakeningPassiveAvailable: boolean;
  rouletteEventId: string | null;
  pendingRollOwner: Owner | null;
  rollResolved: boolean;
  doubleSpeedAppliedThisTurn: boolean;
}

export interface SharedDeckState {
  active: boolean;
  cards: MatchCard[];
}

export interface MatchLogEntry {
  id: string;
  text: string;
}

export interface RouletteEventDefinition {
  id: string;
  title: string;
  description: string;
}

export interface MatchTimerState {
  enabled: boolean;
  totalSecondsLeft: number;
  turnSecondsLeft: number;
  turnDurationSeconds: number;
  speedMultiplier: number;
}

export interface DragonEyeState {
  active: boolean;
  viewer: Owner | null;
  targetOwner: Owner | null;
  cards: MatchCard[];
  selectedCardInstanceId: string | null;
  sourceCardInstanceId: string | null;
}

export interface OracleState {
  active: boolean;
  viewer: Owner | null;
  targetOwner: Owner | null;
  cards: MatchCard[];
  selectedCardInstanceId: string | null;
  sourceCardInstanceId: string | null;
  allowPlaySelectedCard: boolean;
}

export interface MatchRevealState {
  dragonEye: DragonEyeState;
  oracle: OracleState;
}

export interface MatchState {
  matchId: string;
  phase: MatchPhase;
  activePlayer: Owner;
  round: number;
  player: PlayerState;
  ai: PlayerState;
  sharedDeck: SharedDeckState;
  turn: TurnRules;
  timer: MatchTimerState;
  reveal: MatchRevealState;
  log: MatchLogEntry[];
  winner: Owner | null;
  passiveSilencedUntilRound: number | null;
}

export type PlayCardSource = "hand" | "graveyard" | "enemy_deck" | "oracle";

export type AttackTarget =
  | { kind: "hero" }
  | { kind: "unit"; unitId: string };

export type MatchAction =
  | { type: "APPLY_ROLL"; owner: Owner; roll: number }
  | {
      type: "PLAY_CARD";
      owner: Owner;
      source: PlayCardSource;
      cardInstanceId: string;
      slotIndex?: number;
      free?: boolean;
    }
  | {
      type: "ATTACK";
      owner: Owner;
      attackerId: string;
      target: AttackTarget;
    }
  | { type: "USE_AWAKENING_PASSIVE"; owner: Owner }
  | { type: "SELECT_DRAGON_EYE_CARD"; owner: Owner; cardInstanceId: string }
  | { type: "CLOSE_DRAGON_EYE"; owner: Owner }
  | { type: "SELECT_ORACLE_CARD"; owner: Owner; cardInstanceId: string }
  | { type: "PLAY_ORACLE_SELECTED"; owner: Owner; slotIndex?: number }
  | { type: "CLOSE_ORACLE"; owner: Owner }
  | { type: "TICK_TIMER"; seconds?: number }
  | { type: "END_TURN"; owner: Owner };