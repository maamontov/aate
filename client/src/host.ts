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
      <div id="section-lobby">
        <select id="deck-size">
          <option value="" disabled selected>Выберите режим игры</option>
          <option value="10">Быстрый (10 вопросов)</option>
          <option value="20">Средний (20 вопросов)</option>
          <option value="40">Полный (40 вопросов)</option>
        </select>
        <button id="create">Создать комнату</button>
        <button id="start">Старт матча</button>
        <p id="room-code" class="room-code" style="display:none"></p>
      </div>
      <div id="section-game" style="display:none">
        <!-- Шапка: игроки -->
        <div class="game-header">
          <div id="player-a" class="player-card">
            <div class="player-icon" style="background-color: #4CAF50;">🚀</div>
            <div class="player-info">
              <span id="player-a-name">ИГРОК 1</span>
              <span id="player-a-score" class="player-score">0</span>
            </div>
          </div>
          <div class="vs-label">VS</div>
          <div id="player-b" class="player-card">
            <div class="player-icon" style="background-color: #FFC107;">👾</div>
            <div class="player-info">
              <span id="player-b-name">ИГРОК 2</span>
              <span id="player-b-score" class="player-score">0</span>
            </div>
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

          <div id="options-row" class="options-column">
            <div id="opt-1" class="option-card">
              <div class="option-icon">⭐</div>
              <span class="option-text"></span>
            </div>
            <div id="opt-2" class="option-card">
              <div class="option-icon">🌳</div>
              <span class="option-text"></span>
            </div>
            <div id="opt-3" class="option-card">
              <div class="option-icon">💡</div>
              <span class="option-text"></span>
            </div>
          </div>

          <p id="finish-status" class="finish-status" style="display:none"></p>
        </div>

        <!-- Низ: фаза + таймер -->
        <div class="game-footer">
          <p id="phase-label" class="phase-label"></p>
          <div class="timer-track"><div id="timer-bar" class="timer-bar"></div></div>
          <p id="phase-timer" class="phase-timer"></p>
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
      game.style.display = "";
    }
  };

  const setRoomCodeDisplay = (code: string, visible: boolean) => {
    const el = document.querySelector<HTMLParagraphElement>("#room-code");
    if (!el) return;
    el.textContent = code;
    el.style.display = visible ? "" : "none";
  };
  const setPhaseTimer = (label: string, seconds: string) => {
    const labelEl = document.querySelector<HTMLParagraphElement>("#phase-label");
    const timerEl = document.querySelector<HTMLParagraphElement>("#phase-timer");
    if (labelEl) labelEl.textContent = label;
    if (timerEl) timerEl.textContent = seconds;
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
    qNumber.textContent = `ВОПРОС #${room.currentRoundIndex + 1}`;

    for (let i = 0; i < 3; i++) {
      const card = document.querySelector<HTMLDivElement>(`#opt-${i + 1}`);
      if (!card) continue;
      const option = room.currentQuestion.options[i];
      const icon = card.querySelector<HTMLDivElement>(".option-icon");
      const text = card.querySelector<HTMLSpanElement>(".option-text");
      
      if (icon) icon.textContent = ["⭐", "🌳", "💡"][i];
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
    const el = document.querySelector<HTMLParagraphElement>("#finish-status");
    if (!el) return;
    if (room.phase !== "finished") {
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    if (reason === "player_disconnect") {
      const a = room.playerA;
      const b = room.playerB;
      let leader = "Ничья";
      if (a && b && a.score > b.score) leader = `Ведёт ${a.nickname}`;
      else if (a && b && b.score > a.score) leader = `Ведёт ${b.nickname}`;
      el.textContent = `Матч завершён — технические проблемы. ${leader}`;
    } else {
      if (room.winner === "draw") el.textContent = "Ничья!";
      else if (room.winner === "playerA") el.textContent = `Победитель: ${room.playerA?.nickname ?? "A"}`;
      else if (room.winner === "playerB") el.textContent = `Победитель: ${room.playerB?.nickname ?? "B"}`;
      else el.textContent = "Матч завершён";
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
      setPhaseTimer(label, `${seconds}с`);
      setTimerBar(progressPercent(currentPhase, lastDeadline), phaseColor(currentPhase));
    };
    tick();
    if (deadlineTs && phase !== "lobby" && phase !== "finished") timerId = window.setInterval(tick, 500);
  };

  // --- Lobby: dropdown + кнопки ---
  const deckSelect = document.querySelector<HTMLSelectElement>("#deck-size")!;
  const createBtn = document.querySelector<HTMLButtonElement>("#create")!;
  const startBtn = document.querySelector<HTMLButtonElement>("#start")!;

  createBtn.style.display = "none";
  startBtn.style.display = "none";

  deckSelect.onchange = () => {
    createBtn.style.display = deckSelect.value ? "" : "none";
  };

  createBtn.onclick = () => {
    const size = Number(deckSelect.value) as 10 | 20 | 40;
    if (!size) return;
    socket.emit(CLIENT_TO_SERVER.hostCreateRoom, { deckSize: size });
  };

  startBtn.onclick = () => socket.emit(CLIENT_TO_SERVER.hostStartMatch, { roomCode });

  // --- События ---
  socket.off(SERVER_TO_CLIENT.roomCreated);
  socket.on(SERVER_TO_CLIENT.roomCreated, (payload: { roomCode: string }) => {
    setRoomCode(payload.roomCode);
    setMyRole("host");
    showSection("lobby");
    setRoomCodeDisplay(payload.roomCode, true);
    deckSelect.style.display = "none";
    createBtn.style.display = "none";
    startBtn.style.display = "";
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
  });

  setPhaseVisual("lobby");
  restartTimer(null, "lobby");
}
