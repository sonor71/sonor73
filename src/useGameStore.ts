import { create } from "zustand";
import { persist } from "zustand/middleware";

// ✅ Экземпляр карты в инвентаре (каждая копия = отдельная ячейка)
export type OwnedCard = {
  instanceId: string;
  baseId: string;
  title: string;
  frontSrc: string;
  packId?: string;
  rarity?: string;
  type?: string;
  obtainedAt: number;
};

type GameState = {
  premium: number;
  free: number;

  // инвентарь
  ownedCards: OwnedCard[];
  addOwnedCards: (cards: OwnedCard[]) => void;
  grantCards: (cards: OwnedCard[]) => void;
  clearInventory: () => void;

  // ✅ КОЛОДА (храним instanceId в нужном порядке)
  deckIds: string[];

  addToDeck: (id: string) => void;
  removeFromDeck: (id: string) => void;
  clearDeck: () => void;

  // ✅ НОВОЕ: ставим массив deckIds одним действием (нужно для swap)
  setDeckIds: (ids: string[]) => void;

  addPremium: (amount: number) => void;
  addFree: (amount: number) => void;
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      premium: 10,
      free: 1000,

      ownedCards: [],

      addOwnedCards: (cards) => {
        const current = get().ownedCards;
        const existing = new Set(current.map((c) => c.instanceId));
        const uniqueIncoming = cards.filter((c) => !existing.has(c.instanceId));

        const next = [...uniqueIncoming, ...current].sort(
          (a, b) => b.obtainedAt - a.obtainedAt
        );

        set({ ownedCards: next });
      },

      grantCards: (cards) => {
        get().addOwnedCards(cards);
      },

      clearInventory: () => set({ ownedCards: [] }),

      // ----------------
      // ✅ DECK
      // ----------------
      deckIds: [],

      addToDeck: (id) => {
        const cur = get().deckIds;
        if (cur.includes(id)) return;
        set({ deckIds: [...cur, id] });
      },

      removeFromDeck: (id) => {
        set({ deckIds: get().deckIds.filter((x) => x !== id) });
      },

      clearDeck: () => set({ deckIds: [] }),

      setDeckIds: (ids) => set({ deckIds: ids }),

      addPremium: (amount) => set({ premium: get().premium + amount }),
      addFree: (amount) => set({ free: get().free + amount }),
    }),
    {
      name: "fraktum-game-store",
      version: 3, // ✅ подними версию
    }
  )
);
