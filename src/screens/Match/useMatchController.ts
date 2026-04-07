import { useEffect, useReducer, useRef, useState } from "react";
import { useGameStore } from "../../useGameStore";
import { getNextAiAction } from "../../game/match/ai";
import { matchReducer } from "../../game/match/reducer";
import { createInitialMatch } from "../../game/match/setup";
import type { MatchState } from "../../game/match/types";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function useMatchController() {
  const ownedCards = useGameStore((store) => store.ownedCards);
  const deckIds = useGameStore((store) => store.deckIds);

  const initialMatchRef = useRef<MatchState | null>(null);
  if (!initialMatchRef.current) {
    initialMatchRef.current = createInitialMatch(ownedCards, deckIds);
  }

  const [state, dispatch] = useReducer(matchReducer, initialMatchRef.current);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [diceRollingOwner, setDiceRollingOwner] = useState<"player" | "ai" | null>(null);
  const [diceSpinning, setDiceSpinning] = useState(false);
  const [rollPromptPulse, setRollPromptPulse] = useState(false);

  const stateRef = useRef(state);
  const handledAiTurnIntroRef = useRef<string>("");
  const aiLoopTurnKeyRef = useRef<string>("");
  const rollingLockRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const shouldPulse =
      state.phase === "turn_intro" &&
      state.activePlayer === "player" &&
      !state.winner &&
      !diceSpinning;

    setRollPromptPulse(shouldPulse);

    if (shouldPulse && diceRollingOwner !== "player") {
      setDiceValue(null);
    }
  }, [diceRollingOwner, diceSpinning, state.activePlayer, state.phase, state.winner]);

  async function animateRoll(owner: "player" | "ai") {
    if (rollingLockRef.current) return;
    rollingLockRef.current = true;

    setDiceRollingOwner(owner);
    setDiceSpinning(true);
    setDiceValue(Math.floor(Math.random() * 20) + 1);

    let cancelled = false;
    const intervalId = window.setInterval(() => {
      if (cancelled) return;
      setDiceValue(Math.floor(Math.random() * 20) + 1);
    }, 70);

    await sleep(1100);

    cancelled = true;
    window.clearInterval(intervalId);

    const finalRoll = Math.floor(Math.random() * 20) + 1;
    setDiceValue(finalRoll);

    await sleep(220);

    dispatch({ type: "APPLY_ROLL", owner, roll: finalRoll });

    setDiceSpinning(false);
    setDiceRollingOwner(null);
    rollingLockRef.current = false;
  }

  useEffect(() => {
    if (state.phase !== "turn_intro" || state.activePlayer !== "ai" || state.winner) return undefined;

    const introKey = `${state.matchId}:${state.activePlayer}:${state.round}:${state.turn.rollResolved}`;
    if (handledAiTurnIntroRef.current === introKey) return undefined;
    handledAiTurnIntroRef.current = introKey;

    let cancelled = false;

    const runAiRoll = async () => {
      await sleep(500);
      if (cancelled) return;
      await animateRoll("ai");
    };

    void runAiRoll();

    return () => {
      cancelled = true;
    };
  }, [state.activePlayer, state.matchId, state.phase, state.round, state.turn.rollResolved, state.winner]);

  useEffect(() => {
    if (state.phase === "finished" || state.winner || !state.timer.enabled) return undefined;

    const intervalId = window.setInterval(() => {
      dispatch({ type: "TICK_TIMER", seconds: 1 });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [state.phase, state.timer.enabled, state.winner]);

  useEffect(() => {
    if (state.phase !== "ai_turn" || state.activePlayer !== "ai" || state.winner) return undefined;

    const loopKey = `${state.matchId}:${state.round}:${state.activePlayer}:${state.turn.roll}:${state.turn.playsMade}:${state.turn.playedAnyCard}`;
    if (aiLoopTurnKeyRef.current === loopKey) return undefined;
    aiLoopTurnKeyRef.current = loopKey;

    let cancelled = false;

    const runAi = async () => {
      await sleep(500);

      while (!cancelled) {
        const nextAction = getNextAiAction(stateRef.current);
        dispatch(nextAction);

        if (nextAction.type === "END_TURN") {
          break;
        }

        await sleep(420);
      }
    };

    void runAi();

    return () => {
      cancelled = true;
    };
  }, [
    state.activePlayer,
    state.matchId,
    state.phase,
    state.round,
    state.turn.playsMade,
    state.turn.playedAnyCard,
    state.turn.roll,
    state.winner,
  ]);

  return {
    state,
    diceValue,
    diceRollingOwner,
    diceSpinning,
    rollPromptPulse,
    actions: {
      rollDice() {
        if (state.activePlayer !== "player" || state.phase !== "turn_intro" || state.winner) return;
        void animateRoll("player");
      },

      playHandCard(cardInstanceId: string, slotIndex?: number) {
        if (state.activePlayer !== "player" || state.phase !== "player_turn") return;
        dispatch({
          type: "PLAY_CARD",
          owner: "player",
          source: "hand",
          cardInstanceId,
          slotIndex,
        });
      },

      playGraveyardCard(cardInstanceId: string, slotIndex?: number) {
        if (state.activePlayer !== "player" || state.phase !== "player_turn") return;
        dispatch({
          type: "PLAY_CARD",
          owner: "player",
          source: "graveyard",
          cardInstanceId,
          slotIndex,
        });
      },

      playBlindEnemyCard(slotIndex?: number) {
        if (state.activePlayer !== "player" || state.phase !== "player_turn") return;
        if (!state.turn.enemyDeckPlayCardId) return;

        dispatch({
          type: "PLAY_CARD",
          owner: "player",
          source: "enemy_deck",
          cardInstanceId: state.turn.enemyDeckPlayCardId,
          slotIndex,
        });
      },

      playAwakeningFreeCard(source: "hand" | "graveyard", cardInstanceId: string, slotIndex?: number) {
        if (state.activePlayer !== "player" || state.phase !== "player_turn") return;

        dispatch({
          type: "PLAY_CARD",
          owner: "player",
          source,
          cardInstanceId,
          slotIndex,
          free: true,
        });
      },

      useAwakeningPassive() {
        if (state.activePlayer !== "player" || state.phase !== "player_turn") return;
        dispatch({ type: "USE_AWAKENING_PASSIVE", owner: "player" });
      },

      selectDragonEyeCard(cardInstanceId: string) {
        if (!state.reveal.dragonEye.active || state.reveal.dragonEye.viewer !== "player") return;
        dispatch({ type: "SELECT_DRAGON_EYE_CARD", owner: "player", cardInstanceId });
      },

      closeDragonEye() {
        if (!state.reveal.dragonEye.active || state.reveal.dragonEye.viewer !== "player") return;
        dispatch({ type: "CLOSE_DRAGON_EYE", owner: "player" });
      },

      selectOracleCard(cardInstanceId: string) {
        if (!state.reveal.oracle.active || state.reveal.oracle.viewer !== "player") return;
        dispatch({ type: "SELECT_ORACLE_CARD", owner: "player", cardInstanceId });
      },

      playOracleSelected(slotIndex?: number) {
        if (!state.reveal.oracle.active || state.reveal.oracle.viewer !== "player") return;
        dispatch({ type: "PLAY_ORACLE_SELECTED", owner: "player", slotIndex });
      },

      closeOracle() {
        if (!state.reveal.oracle.active || state.reveal.oracle.viewer !== "player") return;
        dispatch({ type: "CLOSE_ORACLE", owner: "player" });
      },

      attack(attackerId: string, target: { kind: "hero" } | { kind: "unit"; unitId: string }) {
        if (state.activePlayer !== "player" || state.phase !== "player_turn") return;
        dispatch({ type: "ATTACK", owner: "player", attackerId, target });
      },

      endTurn() {
        if (state.activePlayer !== "player" || state.phase !== "player_turn") return;
        dispatch({ type: "END_TURN", owner: "player" });
      },
    },
  };
}