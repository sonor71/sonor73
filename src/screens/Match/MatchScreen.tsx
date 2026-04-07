import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  MATCH_BOARD_SIZE,
  MATCH_HAND_SIZE,
  type MatchCard,
  type UnitState,
} from "../../game/match/types";
import { useMatchController } from "./useMatchController";
import "./match.css";

const CARD_BACK = "/cards/card-back.png";

type ModalView = "graveyard" | "log" | "dragon_eye" | "oracle" | null;

type PendingPlay =
  | null
  | {
      source: "hand" | "graveyard" | "enemy_deck" | "oracle";
      card: MatchCard;
      free: boolean;
    };

function ownerLabel(owner: "player" | "ai") {
  return owner === "player" ? "Игрок" : "ИИ";
}

function getRollText(roll: number | null) {
  if (roll === null) return "Нажми на D20, чтобы начать ход.";
  if (roll >= 1 && roll <= 10) return `Можно сыграть до ${roll} карт в этот ход.`;
  if (roll >= 11 && roll <= 14) return "Можно сыграть 1 карту из своего сброса.";
  if (roll >= 15 && roll <= 16) return "Активирована Рулетка Судьбы.";
  if (roll >= 17 && roll <= 18) return "Можно играть сколько угодно карт, но Воля тратится x2.";
  if (roll === 19) return "Можно сыграть 1 случайную карту из колоды противника.";
  return "Пробуждение: сыграй 1 карту бесплатно или пробуди пассивку.";
}

function getTurnCaption(phase: string, activePlayer: "player" | "ai") {
  if (phase === "finished") return "Матч завершён";
  if (phase === "turn_intro") return activePlayer === "player" ? "Твой бросок D20" : "ИИ бросает D20";
  return activePlayer === "player" ? "Ход игрока" : "Ход ИИ";
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function UpgradeSockets() {
  return (
    <div className="matchUpgradeSockets" aria-hidden="true">
      <span className="matchUpgradeSocket" />
      <span className="matchUpgradeSocket" />
      <span className="matchUpgradeSocket" />
      <span className="matchUpgradeSocket" />
    </div>
  );
}

function HeroCluster(props: {
  title: string;
  hp: number;
  will: number;
  deck: number;
  graveyard: number;
  hand: number;
  shieldTurnsLeft?: number | null;
  active?: boolean;
  targetable?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`matchHeroCluster ${props.active ? "isActive" : ""} ${props.targetable ? "isTargetable" : ""}`}
      title={
        props.shieldTurnsLeft
          ? `${props.title}: активен щит ещё ${props.shieldTurnsLeft} ход(а)`
          : props.title
      }
    >
      <div className="matchHeroFrameBars" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="matchHeroClusterGrid">
        <UpgradeSockets />
        <button type="button" className="matchHeroPortrait" onClick={props.onClick} disabled={!props.onClick}>
          <span className="matchHeroPortraitGlow" aria-hidden="true" />
          <span className="matchHeroPortraitLabel">{props.title}</span>
        </button>
        <UpgradeSockets />
      </div>

      <div className="matchHeroMetaTitle">{props.title}</div>

      <div className="matchHeroMeta">
        <div className="matchHeroMetaRow">
          <span>HP {props.hp}</span>
          <span>Воля {props.will}/5</span>
        </div>
        <div className="matchHeroMetaRow">
          <span>Рука {props.hand}</span>
          <span>Колода {props.deck}</span>
        </div>
        <div className="matchHeroMetaRow">
          <span>Сброс {props.graveyard}</span>
          <span>{props.shieldTurnsLeft ? `Щит ${props.shieldTurnsLeft}` : "Щит —"}</span>
        </div>
      </div>
    </div>
  );
}

function DiceRelic(props: {
  value: number | null;
  rolling: boolean;
  owner: "player" | "ai" | null;
  roll: number | null;
  interactive: boolean;
  pulse: boolean;
  onClick: () => void;
}) {
  return (
    <div className="matchDicePanel">
      <div className="matchSectionTitle">Результат броска</div>

      <button
        type="button"
        className={`matchD20Relic ${props.rolling ? "isRolling" : ""} ${props.interactive ? "isInteractive" : ""} ${props.pulse ? "isPrompting" : ""}`}
        aria-label="D20"
        onClick={props.onClick}
        disabled={!props.interactive}
      >
        <div className="matchD20InnerGlow" />
        <div className="matchD20Value">{props.value ?? "?"}</div>
        <div className="matchD20Label">D20</div>
      </button>

      <div className="matchDiceTextBlock">
        <div className="matchDiceTitle">
          {props.owner ? `Бросает: ${ownerLabel(props.owner)}` : "Ожидание броска"}
        </div>
        <div className="matchDiceRule">{getRollText(props.roll)}</div>
      </div>
    </div>
  );
}

function DiscardPile(props: { playerCount: number; aiCount: number; onClick: () => void }) {
  return (
    <button type="button" className="matchDiscardPile" onClick={props.onClick}>
      <div className="matchDiscardPileVisual" aria-hidden="true">
        <span className="matchDiscardCard back1" />
        <span className="matchDiscardCard back2" />
        <span className="matchDiscardCard back3" />
        <span className="matchDiscardCard back4" />
      </div>
      <div className="matchDiscardText">
        <div className="matchDiscardTitle">Сброс</div>
        <div className="matchDiscardMeta">Игрок: {props.playerCount}</div>
        <div className="matchDiscardMeta">ИИ: {props.aiCount}</div>
      </div>
    </button>
  );
}

function EnemyHandRow(props: { count: number }) {
  return (
    <div className="matchEnemyHandRow">
      {Array.from({ length: MATCH_HAND_SIZE }).map((_, index) => {
        const filled = index < props.count;
        return (
          <div key={`enemy-hand-${index}`} className={`matchEnemyHandCard ${filled ? "isFilled" : "isEmpty"}`}>
            {filled ? <img src={CARD_BACK} alt="Карта противника" className="matchEnemyHandImage" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function BoardSlot(props: {
  unit: UnitState | null;
  owner: "player" | "ai";
  emptySelectable?: boolean;
  selected?: boolean;
  attackTarget?: boolean;
  onClick?: () => void;
}) {
  if (!props.unit) {
    return (
      <button
        type="button"
        className={`matchBoardSlot isEmpty ${props.emptySelectable ? "isSelectable" : ""}`}
        onClick={props.onClick}
        disabled={!props.onClick}
        aria-label="Пустой слот"
      >
        {props.emptySelectable ? <span className="matchEmptySlotPlus">+</span> : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`matchBoardSlot isFilled is-${props.owner} ${props.selected ? "isSelected" : ""} ${props.attackTarget ? "isAttackTarget" : ""}`}
      onClick={props.onClick}
      disabled={!props.onClick}
      title={`${props.unit.name} — ${props.unit.description}`}
    >
      <img src={props.unit.frontSrc || CARD_BACK} alt={props.unit.name} className="matchBoardSlotImage" />
      <div className="matchBoardSlotBody">
        <div className="matchBoardSlotTop">
          <span className="matchBoardSlotCost">{props.unit.willCost ?? 0}</span>
        </div>
        <div className="matchBoardSlotStats">
          <span>ATK {props.unit.attack}</span>
          <span>HP {props.unit.health}</span>
        </div>
      </div>
    </button>
  );
}

function HandCard(props: {
  card: MatchCard;
  disabled?: boolean;
  highlight?: boolean;
  selected?: boolean;
  displayCost: number | string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`matchHandCard matchHandCardMinimal ${props.highlight ? "isHighlighted" : ""} ${props.selected ? "isSelected" : ""}`}
      onClick={props.onClick}
      disabled={!props.onClick || props.disabled}
      title={`${props.card.name} — ${props.card.description}`}
    >
      <img src={props.card.frontSrc || CARD_BACK} alt={props.card.name} className="matchHandCardImage" />
      <span className="matchHandCardCost matchHandCardCostOverlay">{props.displayCost}</span>
    </button>
  );
}

function EmptyHandSlot() {
  return <div className="matchHandCard matchHandCardEmpty" />;
}

function OverlayPanel(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="matchModalOverlay" onClick={props.onClose}>
      <div className="matchModalCard" onClick={(event) => event.stopPropagation()}>
        <div className="matchModalHeader">
          <h2>{props.title}</h2>
          <button type="button" className="matchSmallButton" onClick={props.onClose}>
            Закрыть
          </button>
        </div>
        <div className="matchModalBody">{props.children}</div>
      </div>
    </div>
  );
}

export default function MatchScreen() {
  const navigate = useNavigate();
  const { state, diceValue, diceRollingOwner, diceSpinning, rollPromptPulse, actions } = useMatchController();

  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
  const [modalView, setModalView] = useState<ModalView>(null);
  const [pendingPlay, setPendingPlay] = useState<PendingPlay>(null);

  const isPlayerTurn = state.phase === "player_turn" && state.activePlayer === "player";
  const isPlayerRollStep = state.phase === "turn_intro" && state.activePlayer === "player";

  const selectedAttacker = state.player.board.find((unit) => unit?.instanceId === selectedAttackerId) ?? null;
  const boardAttackMode = Boolean(selectedAttacker) && isPlayerTurn;

  const canPlayMoreCards = state.turn.playLimit === null || state.turn.playsMade < state.turn.playLimit;
  const freeAwakeningActive = state.turn.awakeningFreePlayAvailable;

  const blindEnemyCard = useMemo(
    () =>
      state.turn.enemyDeckPlayCardId
        ? [...state.ai.deck, ...state.sharedDeck.cards].find(
            (card) => card.instanceId === state.turn.enemyDeckPlayCardId,
          ) ?? null
        : null,
    [state.ai.deck, state.sharedDeck.cards, state.turn.enemyDeckPlayCardId],
  );

  const oracleSelectedCard = useMemo(
    () =>
      state.reveal.oracle.selectedCardInstanceId
        ? state.reveal.oracle.cards.find((card) => card.instanceId === state.reveal.oracle.selectedCardInstanceId) ??
          null
        : null,
    [state.reveal.oracle.cards, state.reveal.oracle.selectedCardInstanceId],
  );

  const pendingOraclePlacement =
    isPlayerTurn &&
    state.reveal.oracle.active &&
    state.reveal.oracle.viewer === "player" &&
    Boolean(oracleSelectedCard) &&
    canPlayMoreCards;

  useEffect(() => {
    if (!selectedAttackerId) return;
    const stillExists = state.player.board.some((unit) => unit?.instanceId === selectedAttackerId && !unit.exhausted);
    if (!stillExists || !isPlayerTurn) {
      setSelectedAttackerId(null);
    }
  }, [isPlayerTurn, selectedAttackerId, state.player.board]);

  useEffect(() => {
    if (state.reveal.oracle.active && state.reveal.oracle.viewer === "player") {
      setModalView("oracle");
      return;
    }

    if (state.reveal.dragonEye.active && state.reveal.dragonEye.viewer === "player") {
      setModalView("dragon_eye");
      return;
    }

    setModalView((current) => (current === "oracle" || current === "dragon_eye" ? null : current));
  }, [
    state.reveal.dragonEye.active,
    state.reveal.dragonEye.viewer,
    state.reveal.oracle.active,
    state.reveal.oracle.viewer,
  ]);

  useEffect(() => {
    if (!pendingPlay) return;

    const fromHand = state.player.hand.some((card) => card.instanceId === pendingPlay.card.instanceId);
    const fromGraveyard = state.player.graveyard.some((card) => card.instanceId === pendingPlay.card.instanceId);
    const fromEnemyDeck =
      pendingPlay.source === "enemy_deck" && state.turn.enemyDeckPlayCardId === pendingPlay.card.instanceId;
    const fromOracle =
      pendingPlay.source === "oracle" &&
      state.reveal.oracle.active &&
      state.reveal.oracle.selectedCardInstanceId === pendingPlay.card.instanceId;

    if (!(fromHand || fromGraveyard || fromEnemyDeck || fromOracle) || !isPlayerTurn) {
      setPendingPlay(null);
    }
  }, [
    isPlayerTurn,
    pendingPlay,
    state.player.graveyard,
    state.player.hand,
    state.reveal.oracle.active,
    state.reveal.oracle.selectedCardInstanceId,
    state.turn.enemyDeckPlayCardId,
  ]);

  function hasFreeSlot() {
    return state.player.board.some((slot) => slot === null);
  }

  function getDisplayedCost(card: MatchCard, free = false) {
    return free ? 0 : card.willCost * state.turn.willMultiplier;
  }

  function canQueueCard(card: MatchCard, source: "hand" | "graveyard" | "enemy_deck" | "oracle", free = false) {
    if (!isPlayerTurn || !canPlayMoreCards || !hasFreeSlot()) return false;
    if (source === "graveyard" && !state.turn.graveyardPlayAvailable && !free) return false;
    if (source === "enemy_deck" && state.turn.enemyDeckPlayCardId !== card.instanceId) return false;
    if (source === "oracle" && state.reveal.oracle.selectedCardInstanceId !== card.instanceId) return false;

    return state.player.will >= getDisplayedCost(card, free);
  }

  function queuePending(source: "hand" | "graveyard" | "enemy_deck" | "oracle", card: MatchCard, free = false) {
    if (!canQueueCard(card, source, free)) return;

    setSelectedAttackerId(null);
    setPendingPlay((current) => {
      if (
        current &&
        current.source === source &&
        current.card.instanceId === card.instanceId &&
        current.free === free
      ) {
        return null;
      }

      return { source, card, free };
    });
  }

  function placePendingCard(slotIndex: number) {
    if (pendingPlay) {
      if (pendingPlay.source === "hand") {
        if (pendingPlay.free) {
          actions.playAwakeningFreeCard("hand", pendingPlay.card.instanceId, slotIndex);
        } else {
          actions.playHandCard(pendingPlay.card.instanceId, slotIndex);
        }
      } else if (pendingPlay.source === "graveyard") {
        if (pendingPlay.free) {
          actions.playAwakeningFreeCard("graveyard", pendingPlay.card.instanceId, slotIndex);
        } else {
          actions.playGraveyardCard(pendingPlay.card.instanceId, slotIndex);
        }
        setModalView(null);
      } else if (pendingPlay.source === "enemy_deck") {
        actions.playBlindEnemyCard(slotIndex);
      } else if (pendingPlay.source === "oracle") {
        actions.playOracleSelected(slotIndex);
      }

      setPendingPlay(null);
      return;
    }

    if (pendingOraclePlacement && oracleSelectedCard) {
      actions.playOracleSelected(slotIndex);
      setPendingPlay(null);
    }
  }

  const playerHandCards = Array.from({ length: MATCH_HAND_SIZE }, (_, index) => state.player.hand[index] ?? null);
  const reversedLog = [...state.log].reverse();

  return (
    <div className="matchRoot">
      <div className="matchStageWrap">
        <div className="matchStage">
          <div className="matchLayout">
            <section className="matchDiscardPanel">
              <div className="matchSectionTitle">Сброс</div>

              <DiscardPile
                playerCount={state.player.graveyard.length}
                aiCount={state.ai.graveyard.length}
                onClick={() => setModalView("graveyard")}
              />

              <div className="matchDiscardLegend">
                <span>Открой сброс, чтобы посмотреть карты или сыграть их, если эффект хода это разрешает.</span>
              </div>

              <div className="matchRailButtons">
                <button type="button" className="matchSmallButton" onClick={() => setModalView("log")}>
                  Лог матча
                </button>
                <button type="button" className="matchSmallButton" onClick={() => navigate("/play")}>
                  Назад
                </button>
              </div>
            </section>

            <section className="matchEnemyHandPanel">
              <EnemyHandRow count={state.ai.hand.length} />
            </section>

            <aside className="matchHeroPanel matchHeroPanelEnemy">
              <HeroCluster
                title="персонаж противника"
                hp={state.ai.hp}
                will={state.ai.will}
                deck={state.ai.deck.length}
                graveyard={state.ai.graveyard.length}
                hand={state.ai.hand.length}
                shieldTurnsLeft={state.ai.shield?.turnsLeft ?? null}
                active={state.activePlayer === "ai" && state.phase !== "finished"}
                targetable={boardAttackMode}
                onClick={
                  boardAttackMode
                    ? () => {
                        actions.attack(selectedAttacker!.instanceId, { kind: "hero" });
                        setSelectedAttackerId(null);
                      }
                    : undefined
                }
              />
            </aside>

            <section className="matchBoardPanel">
              <div className="matchBoardTopLine">
                <div className="matchBoardTitle">{getTurnCaption(state.phase, state.activePlayer)}</div>
                <div className="matchBoardSubtitle">Поле боя</div>
              </div>

              <div className="matchBoardGrid">
                {Array.from({ length: MATCH_BOARD_SIZE }).map((_, index) => {
                  const unit = state.ai.board[index] ?? null;
                  return (
                    <BoardSlot
                      key={`enemy-slot-${index}`}
                      owner="ai"
                      unit={unit}
                      attackTarget={boardAttackMode && Boolean(unit)}
                      onClick={
                        boardAttackMode && unit
                          ? () => {
                              actions.attack(selectedAttacker!.instanceId, {
                                kind: "unit",
                                unitId: unit.instanceId,
                              });
                              setSelectedAttackerId(null);
                            }
                          : undefined
                      }
                    />
                  );
                })}

                {Array.from({ length: MATCH_BOARD_SIZE }).map((_, index) => {
                  const unit = state.player.board[index] ?? null;
                  const canPlaceHere = (Boolean(pendingPlay) || pendingOraclePlacement) && unit === null && isPlayerTurn;

                  return (
                    <BoardSlot
                      key={`player-slot-${index}`}
                      owner="player"
                      unit={unit}
                      selected={selectedAttackerId === unit?.instanceId}
                      emptySelectable={canPlaceHere}
                      onClick={
                        canPlaceHere
                          ? () => placePendingCard(index)
                          : isPlayerTurn && unit && !unit.exhausted && !pendingPlay && !pendingOraclePlacement
                            ? () => {
                                setSelectedAttackerId((current) => (current === unit.instanceId ? null : unit.instanceId));
                              }
                            : undefined
                      }
                    />
                  );
                })}
              </div>
            </section>

            <section className="matchDiceShell">
              <DiceRelic
                value={diceValue}
                rolling={diceSpinning}
                owner={diceRollingOwner}
                roll={state.turn.roll}
                interactive={isPlayerRollStep}
                pulse={rollPromptPulse}
                onClick={() => actions.rollDice()}
              />
            </section>

            <aside className="matchHeroPanel matchHeroPanelPlayer">
              <HeroCluster
                title="наш персонаж"
                hp={state.player.hp}
                will={state.player.will}
                deck={state.player.deck.length}
                graveyard={state.player.graveyard.length}
                hand={state.player.hand.length}
                shieldTurnsLeft={state.player.shield?.turnsLeft ?? null}
                active={state.activePlayer === "player" && state.phase !== "finished"}
              />
            </aside>

            <section className="matchControlBar">
              <div className="matchControlCapsules">
                <div className="matchControlCapsule">
                  <span>Кол-во воли</span>
                  <strong>{state.player.will}/5</strong>
                </div>
                <div className="matchControlCapsule">
                  <span>Ход №</span>
                  <strong>{state.round}</strong>
                </div>
                <div className="matchControlCapsule">
                  <span>Сыграно</span>
                  <strong>{state.turn.playLimit === null ? `${state.turn.playsMade} / ∞` : `${state.turn.playsMade} / ${state.turn.playLimit}`}</strong>
                </div>
              </div>

              <div className="matchControlActions">
                <button
                  type="button"
                  className={`matchActionButton ${pendingPlay?.source === "enemy_deck" ? "isQueued" : ""}`}
                  title="Сыграть случайную карту из колоды противника"
                  disabled={!blindEnemyCard || !canQueueCard(blindEnemyCard, "enemy_deck")}
                  onClick={() => {
                    if (!blindEnemyCard) return;
                    queuePending("enemy_deck", blindEnemyCard, false);
                  }}
                >
                  Карта врага
                </button>

                <button
                  type="button"
                  className="matchActionButton"
                  title="Использовать пробуждение пассивной способности"
                  disabled={!isPlayerTurn || !state.turn.awakeningPassiveAvailable}
                  onClick={() => {
                    setPendingPlay(null);
                    setSelectedAttackerId(null);
                    actions.useAwakeningPassive();
                  }}
                >
                  Пассивка
                </button>

                <button
                  type="button"
                  className="matchActionButton"
                  title="Сбросить выбор карты или атакующего юнита"
                  disabled={!pendingPlay && !selectedAttackerId && !pendingOraclePlacement}
                  onClick={() => {
                    setPendingPlay(null);
                    setSelectedAttackerId(null);
                  }}
                >
                  Снять выбор
                </button>

                <button
                  type="button"
                  className="matchActionButton isPrimary"
                  disabled={!isPlayerTurn}
                  onClick={() => {
                    setPendingPlay(null);
                    setSelectedAttackerId(null);
                    actions.endTurn();
                  }}
                >
                  Завершить ход
                </button>
              </div>
            </section>

            <section className="matchPlayerHandPanel">
              <div className="matchPlayerHandRow">
                {playerHandCards.map((card, index) =>
                  card ? (
                    <HandCard
                      key={card.instanceId}
                      card={card}
                      displayCost={getDisplayedCost(card, freeAwakeningActive)}
                      disabled={!canQueueCard(card, "hand", freeAwakeningActive)}
                      highlight={canQueueCard(card, "hand", freeAwakeningActive)}
                      selected={pendingPlay?.card.instanceId === card.instanceId && pendingPlay.source === "hand"}
                      onClick={() => queuePending("hand", card, freeAwakeningActive)}
                    />
                  ) : (
                    <EmptyHandSlot key={`empty-hand-${index}`} />
                  ),
                )}
              </div>
            </section>

            <section className="matchInfoPanel">
              <div className="matchSectionTitle">Информация</div>

              <div className="matchInfoTimeGrid">
                <div className="matchInfoTimeBox">
                  <span>Ход</span>
                  <strong>{formatTime(state.timer.turnSecondsLeft)}</strong>
                </div>
                <div className="matchInfoTimeBox">
                  <span>Матч</span>
                  <strong>{formatTime(state.timer.totalSecondsLeft)}</strong>
                </div>
              </div>

              <div className="matchInfoBlock">
                <div className="matchInfoBlockTitle">Эффект числа</div>
                <p>{getRollText(state.turn.roll)}</p>
              </div>

              <div className="matchInfoMeta">
                <span>Множитель воли: x{state.turn.willMultiplier}</span>
                <span>{freeAwakeningActive ? "Пробуждение активно" : "Пробуждение не активно"}</span>
                <span>{boardAttackMode ? "Выбран атакующий юнит" : "Атака не выбрана"}</span>
                <span>{state.timer.speedMultiplier > 1 ? `Ускорение хода x${state.timer.speedMultiplier}` : "Стандартная скорость хода"}</span>
              </div>
            </section>
          </div>
        </div>
      </div>

      {modalView === "graveyard" ? (
        <OverlayPanel title="Сброс игрока" onClose={() => setModalView(null)}>
          <div className="matchModalInfo">
            {state.turn.graveyardPlayAvailable
              ? "Можно сыграть 1 карту из сброса. Выбери карту, затем нажми на пустой слот поля."
              : freeAwakeningActive
                ? "Пробуждение активно: можно бесплатно сыграть карту из сброса. Выбери карту и поставь её в пустой слот."
                : "Сейчас это только просмотр сброса."}
          </div>

          <div className="matchModalCards">
            {state.player.graveyard.length === 0 ? (
              <div className="matchModalEmpty">Сброс пока пуст.</div>
            ) : (
              state.player.graveyard.map((card) => (
                <HandCard
                  key={`grave-${card.instanceId}`}
                  card={card}
                  displayCost={getDisplayedCost(card, freeAwakeningActive)}
                  disabled={!canQueueCard(card, "graveyard", freeAwakeningActive)}
                  highlight={canQueueCard(card, "graveyard", freeAwakeningActive)}
                  selected={pendingPlay?.card.instanceId === card.instanceId && pendingPlay.source === "graveyard"}
                  onClick={() => queuePending("graveyard", card, freeAwakeningActive)}
                />
              ))
            )}
          </div>
        </OverlayPanel>
      ) : null}

      {modalView === "dragon_eye" && state.reveal.dragonEye.active && state.reveal.dragonEye.viewer === "player" ? (
        <OverlayPanel
          title="Dragon Eye — колода противника"
          onClose={() => {
            actions.closeDragonEye();
            setModalView(null);
          }}
        >
          <div className="matchModalInfo">
            Выбери карту, чтобы рассмотреть её. Эта способность только показывает содержимое колоды.
          </div>

          <div className="matchModalCards">
            {state.reveal.dragonEye.cards.length === 0 ? (
              <div className="matchModalEmpty">Колода противника пуста.</div>
            ) : (
              state.reveal.dragonEye.cards.map((card) => (
                <HandCard
                  key={`dragon-eye-${card.instanceId}`}
                  card={card}
                  displayCost={card.willCost}
                  selected={state.reveal.dragonEye.selectedCardInstanceId === card.instanceId}
                  onClick={() => actions.selectDragonEyeCard(card.instanceId)}
                />
              ))
            )}
          </div>
        </OverlayPanel>
      ) : null}

      {modalView === "oracle" && state.reveal.oracle.active && state.reveal.oracle.viewer === "player" ? (
        <OverlayPanel
          title="Оракул — карты из руки противника"
          onClose={() => {
            setPendingPlay(null);
            actions.closeOracle();
            setModalView(null);
          }}
        >
          <div className="matchModalInfo">
            Выбери одну из трёх карт. После выбора нажми на пустой слот поля, чтобы сыграть её против ИИ.
          </div>

          <div className="matchModalCards">
            {state.reveal.oracle.cards.length === 0 ? (
              <div className="matchModalEmpty">У противника нет карт для просмотра.</div>
            ) : (
              state.reveal.oracle.cards.map((card) => (
                <HandCard
                  key={`oracle-${card.instanceId}`}
                  card={card}
                  displayCost={getDisplayedCost(card, false)}
                  disabled={!canQueueCard(card, "oracle", false)}
                  highlight={canQueueCard(card, "oracle", false)}
                  selected={state.reveal.oracle.selectedCardInstanceId === card.instanceId}
                  onClick={() => {
                    actions.selectOracleCard(card.instanceId);
                    queuePending("oracle", card, false);
                  }}
                />
              ))
            )}
          </div>
        </OverlayPanel>
      ) : null}

      {modalView === "log" ? (
        <OverlayPanel title="Лог матча" onClose={() => setModalView(null)}>
          <div className="matchLogList">
            {reversedLog.map((entry) => (
              <div key={entry.id} className="matchLogEntry">
                {entry.text}
              </div>
            ))}
          </div>
        </OverlayPanel>
      ) : null}

      {state.phase === "finished" && (
        <div className="matchModalOverlay">
          <div className="matchResultCard">
            <div className="matchResultKicker">FRAKTUM MATCH</div>
            <h2>{state.winner === "player" ? "Победа" : "Поражение"}</h2>
            <p>
              {state.winner === "player"
                ? "ИИ пал. Можешь вернуться к выбору режима или сыграть ещё раз."
                : "Твой герой пал. Перезапусти матч и попробуй другой темп игры."}
            </p>
            <div className="matchResultActions">
              <button
                type="button"
                className="matchActionButton isPrimary"
                onClick={() => window.location.reload()}
              >
                Сыграть снова
              </button>
              <button type="button" className="matchActionButton" onClick={() => navigate("/play")}>
                Вернуться
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
