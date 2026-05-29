import { setupBaseEvents } from "./baseEvents";
import { CLIENT_TO_SERVER, SERVER_TO_CLIENT } from "./events";
import { socket } from "./socket";
import { roomCode, setMyRole, setRoomCode } from "./state";
import { formatSecondsLeft, phaseColor, progressPercent } from "./timer";
import type { Phase, RoomState } from "./types";

const PHASE_LABELS: Record<Phase, string> = {
  lobby: "Лобби",
  question: "Вопрос",
  answering: "Ответ",
  guessing: "Угадай",
  reveal: "Раскрытие",
  finished: "Конец",
};

export function renderHost(appEl: HTMLDivElement): void {
  appEl.innerHTML = `
    <div id="host-panel" class="panel host-panel">
      <div id="section-lobby" class="section-lobby">
        <p id="room-code" class="room-code"></p>
        <div class="lobby-players">
          <div class="lobby-player" id="lobby-player-a">
            <span class="lobby-dot"></span>
            <span>Игрок 1: <strong id="lobby-a-name">Ожидание...</strong></span>
          </div>
          <div class="lobby-player" id="lobby-player-b">
            <span class="lobby-dot"></span>
            <span>Игрок 2: <strong id="lobby-b-name">Ожидание...</strong></span>
          </div>
        </div>
        <button id="start" disabled>Старт матча</button>
      </div>
      <div id="section-game" class="section-game" style="display:none">
        <!-- Шапка: игроки -->
        <div class="game-header">
          <div class="player-block player-left">
            <div class="player-score" id="player-a-score">0</div>
            <div class="player-name" id="player-a-name">ИГРОК 1</div>
          </div>
          <div class="player-block player-right">
            <div class="player-name" id="player-b-name">ИГРОК 2</div>
            <div class="player-score" id="player-b-score">0</div>
          </div>
        </div>

        <!-- Центр: вопрос + ответы -->
        <div class="game-center">
          <div id="question-area" style="display:none">
            <div class="question-container">
              <div id="question-number" class="question-number">ВОПРОС #1</div>
              <p id="question-text" class="question-text"></p>
            </div>
          </div>

          <div id="options-area" class="options-grid">
            <div class="options-row-top">
              <div id="opt-1" class="option-card">
                <span class="option-text"></span>
              </div>
              <div id="opt-2" class="option-card">
                <span class="option-text"></span>
              </div>
            </div>
            <div class="options-row-bottom">
              <div id="opt-3" class="option-card">
                <span class="option-text"></span>
              </div>
            </div>
          </div>

          <div id="finish-status" class="finish-status" style="display:none">
            <div class="finish-winner"></div>
            <div class="finish-score"></div>
          </div>
        </div>

        <!-- Низ: таймер с текстом внутри -->
        <div class="game-footer">
          <div class="timer-track">
            <div id="timer-bar" class="timer-bar"></div>
            <span id="timer-text" class="timer-text"></span>
          </div>
        </div>
        <!-- Оверлей паузы -->
        <div id="pause-overlay" class="pause-overlay" style="display:none">
          <div class="pause-text">⏸ ПАУЗА</div>
          <div id="pause-info" class="pause-info"></div>
        </div>
      </div>
    </div>
  `;

  const showSection = (phase: RoomState["phase"]) => {
    const lobby = document.querySelector<HTMLDivElement>("#section-lobby");
    const game = document.querySelector<HTMLDivElement>("#section-game");
    if (!lobby || !game) return;
    if (phase === "lobby") {
      lobby.style.display = "";
      game.style.display = "none";
    } else {
      lobby.style.display = "none";
      game.style.display = "flex";
    }
  };

  const setRoomCodeDisplay = (code: string, visible: boolean) => {
    const el = document.querySelector<HTMLParagraphElement>("#room-code");
    if (!el) return;
    el.textContent = code;
    el.style.display = visible ? "" : "none";
  };
  const setPhaseTimer = (label: string, seconds: string) => {
    const el = document.querySelector<HTMLSpanElement>("#timer-text");
    if (el) el.textContent = `${label} · ${seconds}`;
  };
  const setTimerBar = (percent: number, color: string) => {
    const bar = document.querySelector<HTMLDivElement>("#timer-bar");
    if (!bar) return;
    bar.style.width = `${percent}%`;
    bar.style.background = color;
  };
  const setPhaseVisual = (phase: RoomState["phase"]) => {
    const panel = document.querySelector<HTMLDivElement>("#host-panel");
    if (!panel) return;
    panel.classList.remove(
      "phase-lobby",
      "phase-question",
      "phase-answering",
      "phase-guessing",
      "phase-reveal",
      "phase-finished"
    );
    panel.classList.add(`phase-${phase}`);
    panel.classList.add("phase-transition");
    window.setTimeout(() => panel.classList.remove("phase-transition"), 200);
  };

  const renderPlayers = (room: RoomState) => {
    const aName = document.querySelector<HTMLSpanElement>("#player-a-name");
    const aScore = document.querySelector<HTMLSpanElement>("#player-a-score");
    const bName = document.querySelector<HTMLSpanElement>("#player-b-name");
    const bScore = document.querySelector<HTMLSpanElement>("#player-b-score");
    if (aName) aName.textContent = room.playerA?.nickname ?? "ИГРОК 1";
    if (aScore) aScore.textContent = room.playerA ? String(room.playerA.score) : "150";
    if (bName) bName.textContent = room.playerB?.nickname ?? "ИГРОК 2";
    if (bScore) bScore.textContent = room.playerB ? String(room.playerB.score) : "230";
  };

  const renderQuestion = (room: RoomState) => {
    const area = document.querySelector<HTMLDivElement>("#question-area");
    const qText = document.querySelector<HTMLParagraphElement>("#question-text");
    const qNumber = document.querySelector<HTMLDivElement>(".question-number");
    if (!area || !qText || !qNumber) return;

    if (!room.currentQuestion || room.phase === "lobby" || room.phase === "finished") {
      area.style.display = "none";
      return;
    }

    area.style.display = "";
    qText.textContent = room.currentQuestion.text;
    qNumber.textContent = `${room.currentRoundIndex + 1}/${room.deckSize}`;

    for (let i = 0; i < 3; i++) {
      const card = document.querySelector<HTMLDivElement>(`#opt-${i + 1}`);
      if (!card) continue;
      const option = room.currentQuestion.options[i];
      const text = card.querySelector<HTMLSpanElement>(".option-text");
      
      if (text) text.textContent = option;
      card.className = "option-card";

      if (room.phase === "reveal") {
        if (room.activeAnswer === i + 1 && room.guessAnswer === i + 1) {
          card.classList.add("match");
        } else {
          if (room.activeAnswer === i + 1) card.classList.add("selected-active");
          if (room.guessAnswer === i + 1) card.classList.add("selected-guess");
        }
      }
    }
  };

  const renderFinish = (room: RoomState, reason?: string) => {
    const el = document.querySelector<HTMLDivElement>("#finish-status");
    const options = document.querySelector<HTMLDivElement>("#options-area");
    const question = document.querySelector<HTMLDivElement>("#question-area");
    if (!el) return;
    
    if (room.phase !== "finished") {
      el.style.display = "none";
      if (options) options.style.display = "";
      return;
    }
    
    // Скрыть ответы и вопрос
    if (options) options.style.display = "none";
    if (question) question.style.display = "none";
    
    el.style.display = "";
    const winnerEl = el.querySelector<HTMLDivElement>(".finish-winner");
    const scoreEl = el.querySelector<HTMLDivElement>(".finish-score");
    
    const a = room.playerA;
    const b = room.playerB;
    const scoreText = a && b ? `${a.nickname}: ${a.score} — ${b.score} :${b.nickname}` : "";
    
    if (reason === "player_disconnect") {
      let leader = "Ничья";
      if (a && b && a.score > b.score) leader = `Ведёт ${a.nickname}`;
      else if (a && b && b.score > a.score) leader = `Ведёт ${b.nickname}`;
      if (winnerEl) winnerEl.textContent = "Матч завершён";
      if (scoreEl) scoreEl.textContent = `${leader} · ${scoreText}`;
    } else {
      if (room.winner === "draw") {
        if (winnerEl) winnerEl.textContent = "Ничья!";
      } else if (room.winner === "playerA") {
        if (winnerEl) winnerEl.textContent = `Победитель: ${a?.nickname ?? "A"}`;
      } else if (room.winner === "playerB") {
        if (winnerEl) winnerEl.textContent = `Победитель: ${b?.nickname ?? "B"}`;
      } else {
        if (winnerEl) winnerEl.textContent = "Матч завершён";
      }
      if (scoreEl) scoreEl.textContent = scoreText;
    }
  };

  setupBaseEvents(() => {});
  let lastDeadline: number | null = null;
  let currentPhase: RoomState["phase"] = "lobby";
  let timerId: number | null = null;
  let finishReason: string | undefined;

  const restartTimer = (deadlineTs: number | null, phase: RoomState["phase"]) => {
    lastDeadline = deadlineTs;
    currentPhase = phase;
    if (timerId) window.clearInterval(timerId);
    const tick = () => {
      const label = PHASE_LABELS[currentPhase] ?? currentPhase;
      const seconds = formatSecondsLeft(lastDeadline);
      setPhaseTimer(label, seconds);
      setTimerBar(progressPercent(currentPhase, lastDeadline), phaseColor(currentPhase));
    };
    tick();
    if (deadlineTs && phase !== "lobby" && phase !== "finished") timerId = window.setInterval(tick, 500);
  };

  // --- Lobby: кнопка старта ---
  const startBtn = document.querySelector<HTMLButtonElement>("#start")!;

  startBtn.onclick = () => socket.emit(CLIENT_TO_SERVER.hostStartMatch, { roomCode });

  // Автоматически создаём комнату при загрузке
  socket.emit(CLIENT_TO_SERVER.hostCreateRoom, { deckSize: 15 });

  // --- События ---
  socket.off(SERVER_TO_CLIENT.roomCreated);
  socket.on(SERVER_TO_CLIENT.roomCreated, (payload: { roomCode: string }) => {
    setRoomCode(payload.roomCode);
    setMyRole("host");
    setRoomCodeDisplay(payload.roomCode, true);
  });

  socket.off(SERVER_TO_CLIENT.matchFinished);
  socket.on(SERVER_TO_CLIENT.matchFinished, (payload: { winner: string | null; reason?: string }) => {
    finishReason = payload.reason;
  });

  socket.off(SERVER_TO_CLIENT.roomUpdated);
  socket.on(SERVER_TO_CLIENT.roomUpdated, (room: RoomState) => {
    setRoomCode(room.roomCode);
    showSection(room.phase);
    setRoomCodeDisplay(room.roomCode, room.phase === "lobby");
    setPhaseVisual(room.phase);
    restartTimer(room.phaseDeadlineTs, room.phase);
    renderPlayers(room);
    renderQuestion(room);
    renderFinish(room, finishReason);

    // Обновляем лобби
    if (room.phase === "lobby") {
      const lobbyA = document.querySelector<HTMLDivElement>("#lobby-a-name");
      const lobbyB = document.querySelector<HTMLDivElement>("#lobby-b-name");
      const lobbyPlayerA = document.querySelector<HTMLDivElement>("#lobby-player-a");
      const lobbyPlayerB = document.querySelector<HTMLDivElement>("#lobby-player-b");

      if (lobbyA) lobbyA.textContent = room.playerA?.nickname ?? "Ожидание...";
      if (lobbyB) lobbyB.textContent = room.playerB?.nickname ?? "Ожидание...";
      if (lobbyPlayerA) lobbyPlayerA.classList.toggle("connected", !!room.playerA);
      if (lobbyPlayerB) lobbyPlayerB.classList.toggle("connected", !!room.playerB);

      const bothConnected = room.playerA && room.playerB;
      startBtn.disabled = !bothConnected;
    }

    // Пауза
    const pauseOverlay = document.querySelector<HTMLDivElement>("#pause-overlay");
    const pauseInfo = document.querySelector<HTMLDivElement>("#pause-info");
    if (pauseOverlay && pauseInfo) {
      if (room.paused) {
        pauseOverlay.style.display = "flex";
        const pauserName = room.pausedBy === "playerA"
          ? room.playerA?.nickname
          : room.pausedBy === "playerB"
            ? room.playerB?.nickname
            : null;
        pauseInfo.textContent = pauserName ? `${pauserName} поставил паузу` : "Пауза";
      } else {
        pauseOverlay.style.display = "none";
      }
    }
  });

  setPhaseVisual("lobby");
  restartTimer(null, "lobby");
}
