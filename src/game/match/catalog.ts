import type { OwnedCard } from "../../useGameStore";
import type {
  CardKind,
  CardTemplate,
  MatchCard,
  RouletteEventDefinition,
} from "./types";

const CARD_BACK = "/cards/card-back.png";

function clampWill(value: number) {
  return Math.min(4, Math.max(1, value));
}

function normalizeKind(value: string | undefined): CardKind {
  const source = (value ?? "").trim().toLowerCase();
  if (source.includes("персонаж") || source.includes("character")) return "character";
  if (source.includes("тактик") || source.includes("tactic")) return "tactic";
  if (source.includes("эффект") || source.includes("effect")) return "effect";
  return "event";
}

function normalizeRarity(value: string | undefined) {
  const source = (value ?? "").trim().toLowerCase();

  if (source.includes("common") || source.includes("обыч")) return "common";
  if (source.includes("uncommon") || source.includes("необыч")) return "uncommon";
  if (source.includes("rare") || source.includes("редк")) return "rare";
  if (source.includes("epic") || source.includes("эпич")) return "epic";
  if (source.includes("legend") || source.includes("легенд")) return "legendary";
  if (source.includes("myth") || source.includes("миф")) return "mythic";
  if (source.includes("chrom") || source.includes("хром")) return "chromatic";

  return "common";
}

function willFromRarity(rarity: string) {
  switch (rarity) {
    case "rare":
      return 2;
    case "epic":
      return 3;
    case "legendary":
    case "mythic":
    case "chromatic":
      return 4;
    case "uncommon":
      return 2;
    default:
      return 1;
  }
}

const TEMPLATE_LIBRARY: Record<string, CardTemplate> = {
  reverse_heart: {
    baseId: "reverse_heart",
    name: "Реверсивное сердце",
    kind: "effect",
    rarity: "epic",
    willCost: 3,
    description: "Меняет текущее HP твоего героя и героя противника местами.",
    frontSrc: "/cards/reverse-heart.png",
    scriptedEffectKey: "reverse_heart",
  },

  shadow_sword: {
    baseId: "shadow_sword",
    name: "Shadow Sword",
    kind: "event",
    rarity: "rare",
    willCost: 2,
    description: "Наносит 2 HP герою противника.",
    frontSrc: "/cards/shadow-sword.png",
    scriptedEffectKey: "shadow_sword",
  },

  shield_hope: {
    baseId: "shield_hope",
    name: "Щит надежды",
    kind: "effect",
    rarity: "epic",
    willCost: 2,
    description: "Защищает тебя от атак с уроном не выше 3 HP в течение 2 ходов.",
    frontSrc: "/cards/shield-hope.png",
    scriptedEffectKey: "shield_of_hope",
  },

  sandstorm: {
    baseId: "sandstorm",
    name: "Песчаная буря",
    kind: "event",
    rarity: "epic",
    willCost: 3,
    description: "Наносит 3 HP герою противника.",
    frontSrc: "/cards/sandstorm.png",
    scriptedEffectKey: "sandstorm",
  },

  oracle: {
    baseId: "oracle",
    name: "Оракул",
    kind: "character",
    rarity: "legendary",
    willCost: 3,
    attack: 2,
    health: 4,
    description: "Покажи 3 случайные карты из руки противника и сыграй одну из них против него.",
    frontSrc: "/cards/oracle.png",
    scriptedEffectKey: "oracle",
  },

  wood_vines: {
    baseId: "wood_vines",
    name: "Древесные лозы",
    kind: "tactic",
    rarity: "common",
    willCost: 1,
    description: "Союзные карты на поле получают +1 к атаке.",
    frontSrc: "/cards/wood-vines.png",
    spell: {
      id: "wood_vines_spell",
      description: "Усиление союзного поля.",
      steps: [{ kind: "buff_board", target: "friendly", attack: 1, health: 0 }],
    },
  },

  dragon_eye: {
    baseId: "dragon_eye",
    name: "Dragon Eye",
    kind: "character",
    rarity: "epic",
    willCost: 4,
    attack: 4,
    health: 4,
    description: "Позволяет посмотреть карты в колоде противника.",
    frontSrc: "/cards/dragon-eye.png",
    scriptedEffectKey: "dragon_eye",
  },

  hyper_night: {
    baseId: "hyper_night",
    name: "Hyper Night",
    kind: "effect",
    rarity: "chromatic",
    willCost: 4,
    description: "Все карты на поле получают 1 урон, а ты добираешь 1 карту.",
    frontSrc: "/cards/hyper-night.png",
    spell: {
      id: "hyper_night_spell",
      description: "Глобальный удар и добор.",
      steps: [
        { kind: "damage_all_units", target: "all", amount: 1 },
        { kind: "draw_cards", target: "self", amount: 1 },
      ],
    },
  },

  time_of_reckoning: {
    baseId: "time_of_reckoning",
    name: "Time of Reckoning",
    kind: "tactic",
    rarity: "chromatic",
    willCost: 4,
    description: "Наноси 4 урона герою врага.",
    frontSrc: "/cards/time-of-reckoning.png",
    spell: {
      id: "time_of_reckoning_spell",
      description: "Сильный удар по герою.",
      steps: [{ kind: "damage_hero", target: "enemy", amount: 4 }],
    },
  },

  seventy_one: {
    baseId: "seventy_one",
    name: "Seventy One",
    kind: "character",
    rarity: "epic",
    willCost: 3,
    attack: 3,
    health: 3,
    description: "Пассивка: получает +1/+1 при повторной активации.",
    frontSrc: "/cards/seventy-one.png",
    passive: {
      id: "seventy_one_passive",
      name: "Инерция",
      description: "Усиливает самого себя на +1/+1.",
      steps: [{ kind: "buff_self", attack: 1, health: 1 }],
      reusable: true,
    },
  },

  energy_sword: {
    baseId: "energy_sword",
    name: "Energy Sword",
    kind: "event",
    rarity: "rare",
    willCost: 2,
    description: "Наносит 4 HP герою противника.",
    frontSrc: "/cards/energy-sword.png",
    scriptedEffectKey: "energy_sword",
  },

  double_speed: {
    baseId: "double_speed",
    name: "Double Speed",
    kind: "tactic",
    rarity: "rare",
    willCost: 2,
    description: "Ускоряет таймер матча в 2 раза.",
    frontSrc: "/cards/double-speed.png",
    scriptedEffectKey: "double_speed",
  },

  tree_of_life: {
    baseId: "tree_of_life",
    name: "Tree of Life",
    kind: "character",
    rarity: "legendary",
    willCost: 4,
    attack: 2,
    health: 6,
    description: "Восстанавливает тебе 6 HP.",
    frontSrc: "/cards/tree-of-life.png",
    scriptedEffectKey: "tree_of_life",
  },

  book_knowledge: {
    baseId: "book_knowledge",
    name: "Book Knowledge",
    kind: "tactic",
    rarity: "rare",
    willCost: 2,
    description: "Добери 2 карты.",
    frontSrc: "/cards/book-knowledge.png",
    spell: {
      id: "book_knowledge_spell",
      description: "Чистый добор.",
      steps: [{ kind: "draw_cards", target: "self", amount: 2 }],
    },
  },

  amulet_of_old_sage: {
    baseId: "amulet_of_old_sage",
    name: "Amulet of old sage",
    kind: "effect",
    rarity: "epic",
    willCost: 3,
    description: "Добери 1 карту и восстанови 1 Волю.",
    frontSrc: "/cards/amulet-of-old-sage.png",
    spell: {
      id: "amulet_of_old_sage_spell",
      description: "Добор и Воля.",
      steps: [
        { kind: "draw_cards", target: "self", amount: 1 },
        { kind: "gain_will", target: "self", amount: 1 },
      ],
    },
  },

  LSEORAC: {
    baseId: "LSEORAC",
    name: "Оракул",
    kind: "character",
    rarity: "legendary",
    willCost: 3,
    attack: 2,
    health: 4,
    description: "Покажи 3 случайные карты из руки противника и сыграй одну из них против него.",
    frontSrc: "/cards/oracle.png",
    scriptedEffectKey: "oracle",
  },

  MCHANUB: {
    baseId: "MCHANUB",
    name: "Анубис",
    kind: "character",
    rarity: "mythic",
    willCost: 4,
    attack: 4,
    health: 5,
    description: "Пассивка: наносит 1 урон герою врага.",
    frontSrc: CARD_BACK,
    passive: {
      id: "anubis_passive",
      name: "Суд мёртвых",
      description: "Наносит 1 урон герою врага.",
      steps: [{ kind: "damage_hero", target: "enemy", amount: 1 }],
      reusable: true,
    },
  },

  ESEKADU: {
    baseId: "ESEKADU",
    name: "Кадуцей",
    kind: "effect",
    rarity: "epic",
    willCost: 2,
    description: "Лечит на 2 и даёт 1 Волю.",
    frontSrc: CARD_BACK,
    spell: {
      id: "kaduceus_spell",
      description: "Поддержка владельца.",
      steps: [
        { kind: "heal_hero", target: "self", amount: 2 },
        { kind: "gain_will", target: "self", amount: 1 },
      ],
    },
  },

  RCHSOBE: {
    baseId: "RCHSOBE",
    name: "Собек",
    kind: "character",
    rarity: "rare",
    willCost: 2,
    attack: 3,
    health: 2,
    description: "Пассивка: наносит 1 урон герою врага.",
    frontSrc: CARD_BACK,
    passive: {
      id: "sobek_passive",
      name: "Укус реки",
      description: "Наносит 1 урон герою врага.",
      steps: [{ kind: "damage_hero", target: "enemy", amount: 1 }],
      reusable: true,
    },
  },

  UCHEHRA: {
    baseId: "UCHEHRA",
    name: "Храм",
    kind: "tactic",
    rarity: "uncommon",
    willCost: 1,
    description: "Усиливает союзное поле на +1/+1.",
    frontSrc: CARD_BACK,
    spell: {
      id: "temple_spell",
      description: "Молитва храма.",
      steps: [{ kind: "buff_board", target: "friendly", attack: 1, health: 1 }],
    },
  },

  CSEPEST: {
    baseId: "CSEPEST",
    name: "Песчаная Буря",
    kind: "effect",
    rarity: "epic",
    willCost: 2,
    description: "Наносит 3 HP герою противника.",
    frontSrc: CARD_BACK,
    scriptedEffectKey: "sandstorm",
  },
};

export const ROULETTE_EVENTS: RouletteEventDefinition[] = [
  {
    id: "deck_unity",
    title: "Объединение колод",
    description: "Остатки обеих колод сливаются в один общий пул добора.",
  },
  {
    id: "echo_call",
    title: "Зов Эха",
    description: "Оба игрока автоматически пытаются сыграть верхнюю карту своей колоды.",
  },
  {
    id: "eternal_pain",
    title: "Проклятие Вечной Боли",
    description: "Каждый игрок теряет 1 HP за каждую карту типа Эффект у себя на поле, в руке и в сбросе.",
  },
  {
    id: "sphere_silence",
    title: "Тишина Сфер",
    description: "Пассивки всех карт отключаются до конца круга.",
  },
  {
    id: "eternity_blessing",
    title: "Благословение Вечности",
    description: "Текущий игрок берёт одну карту из своего сброса в руку.",
  },
  {
    id: "blood_tithe",
    title: "Кровавый десятинник",
    description: "Оба героя теряют по 2 HP.",
  },
  {
    id: "lucky_stream",
    title: "Поток удачи",
    description: "Текущий игрок добирает 2 карты.",
  },
  {
    id: "broken_hourglass",
    title: "Разбитые часы",
    description: "Текущий игрок восстанавливает 1 Волю.",
  },
  {
    id: "ashen_rain",
    title: "Пепельный дождь",
    description: "Все карты на поле получают 1 урон.",
  },
  {
    id: "mirror_flare",
    title: "Зеркальная вспышка",
    description: "Оба игрока лечатся на 1 HP.",
  },
  {
    id: "rage_of_void",
    title: "Ярость Бездны",
    description: "Все карты текущего игрока получают +1 к атаке.",
  },
  {
    id: "iron_mercy",
    title: "Железная милость",
    description: "Текущий игрок лечится на 3 HP.",
  },
  {
    id: "deep_memory",
    title: "Глубинная память",
    description: "Текущий игрок берёт 1 случайную карту из своего сброса в руку.",
  },
  {
    id: "frayed_signal",
    title: "Потрёпанный сигнал",
    description: "Оба игрока добирают по 1 карте.",
  },
  {
    id: "cold_contract",
    title: "Холодный контракт",
    description: "Текущий игрок наносит 2 урона герою врага.",
  },
  {
    id: "fading_echo",
    title: "Гаснущее эхо",
    description: "Случайная карта текущего игрока на поле получает +1/+1.",
  },
  {
    id: "rift_whisper",
    title: "Шёпот Разлома",
    description: "Вражеский герой теряет 1 HP, а текущий игрок получает 1 Волю.",
  },
  {
    id: "moon_reserve",
    title: "Лунный резерв",
    description: "Оба игрока получают по 1 Воле.",
  },
  {
    id: "glass_comet",
    title: "Стеклянная комета",
    description: "Все вражеские карты на поле получают 1 урон.",
  },
  {
    id: "last_oath",
    title: "Последняя клятва",
    description: "Текущий игрок добирает 1 карту и лечится на 1 HP.",
  },
];

export function getTemplateForOwnedCard(card: OwnedCard): CardTemplate {
  const byBaseId = TEMPLATE_LIBRARY[card.baseId];
  if (byBaseId) {
    return {
      ...byBaseId,
      frontSrc: card.frontSrc || byBaseId.frontSrc || CARD_BACK,
      name: card.title || byBaseId.name,
      rarity: normalizeRarity(card.rarity) || byBaseId.rarity,
    };
  }

  const rarity = normalizeRarity(card.rarity);
  const kind = normalizeKind(card.type);
  const willCost = clampWill(willFromRarity(rarity));
  const frontSrc = card.frontSrc || CARD_BACK;
  const title = card.title || card.baseId;

  if (kind === "character") {
    return {
      baseId: card.baseId,
      name: title,
      kind,
      rarity,
      willCost,
      attack: Math.max(1, willCost),
      health: Math.max(2, willCost + 1),
      description: "Пассивка: наносит 1 урон герою врага.",
      frontSrc,
      passive: {
        id: `${card.baseId}_passive`,
        name: "Импульс",
        description: "Наносит 1 урон герою врага.",
        steps: [{ kind: "damage_hero", target: "enemy", amount: 1 }],
        reusable: true,
      },
    };
  }

  if (kind === "effect") {
    return {
      baseId: card.baseId,
      name: title,
      kind,
      rarity,
      willCost,
      description: "Лечит героя на 2.",
      frontSrc,
      spell: {
        id: `${card.baseId}_spell`,
        description: "Базовое лечение.",
        steps: [{ kind: "heal_hero", target: "self", amount: 2 }],
      },
    };
  }

  if (kind === "tactic") {
    return {
      baseId: card.baseId,
      name: title,
      kind,
      rarity,
      willCost,
      description: "Добирает 1 карту.",
      frontSrc,
      spell: {
        id: `${card.baseId}_spell`,
        description: "Базовый добор.",
        steps: [{ kind: "draw_cards", target: "self", amount: 1 }],
      },
    };
  }

  return {
    baseId: card.baseId,
    name: title,
    kind: "event",
    rarity,
    willCost,
    description: "Наносит 2 урона герою врага.",
    frontSrc,
    spell: {
      id: `${card.baseId}_spell`,
      description: "Базовый удар.",
      steps: [{ kind: "damage_hero", target: "enemy", amount: 2 }],
    },
  };
}

export function createMatchCard(template: CardTemplate, instanceId: string): MatchCard {
  return {
    instanceId,
    baseId: template.baseId,
    name: template.name,
    kind: template.kind,
    willCost: template.willCost,
    attack: template.attack,
    health: template.health,
    rarity: template.rarity,
    description: template.description,
    frontSrc: template.frontSrc,
    passive: template.passive,
    spell: template.spell,
    scriptedEffectKey: template.scriptedEffectKey,
  };
}

export function createMatchCardFromOwned(card: OwnedCard, instanceId?: string): MatchCard {
  const template = getTemplateForOwnedCard(card);
  return createMatchCard(template, instanceId ?? card.instanceId);
}

const STARTER_TEMPLATE_IDS = [
  "oracle",
  "shadow_sword",
  "shield_hope",
  "sandstorm",
  "wood_vines",
  "dragon_eye",
  "energy_sword",
  "book_knowledge",
  "tree_of_life",
  "double_speed",
  "reverse_heart",
  "time_of_reckoning",
  "seventy_one",
  "hyper_night",
  "amulet_of_old_sage",
  "RCHSOBE",
  "ESEKADU",
  "UCHEHRA",
  "CSEPEST",
  "MCHANUB",
];

export function createStarterDeck(prefix: string): MatchCard[] {
  return STARTER_TEMPLATE_IDS.map((templateId, index) => {
    const template = TEMPLATE_LIBRARY[templateId];
    return createMatchCard(template, `${prefix}_${template.baseId}_${index}`);
  });
}