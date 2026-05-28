import { setupBaseEvents } from "./baseEvents";
import { CLIENT_TO_SERVER, SERVER_TO_CLIENT } from "./events";
import { socket } from "./socket";
import { roomCode, setMyRole, setRoomCode } from "./state";
import { formatSecondsLeft, phaseColor, progressPercent } from "./timer";
import type { RoomState } from "./types";

export function renderHost(appEl: HTMLDivElement): void {
  appEl.innerHTML = `
    <div id="host-panel" class="panel">
      <div id="section-lobby">
        <h2>AATE — Конфигурация</h2>
        <p class="muted">Создание комнаты и управление матчем.</p>
        <select id="deck-size">
          <option value="" disabled selected>Выберите режим игры</option>
          <option value="10">Быстрый (10 вопросов)</option>
          <option value="20">Средний (20 вопросов)</option>
          <option value="40">Полный (40 вопросов)</option>
        </select>
        <button id="create">Создать комнату</button>
        <button id="start">Старт матча</button>
        <hr />
        <p id="status-lobby" class="muted"></p>
        <p id="state-lobby" class="muted"></p>
      </div>
      <div id="section-game" style="display:none">
        <h2>AATE — Матч</h2>
        <p id="status-game" class="muted"></p>
        <p id="state-game" class="muted"></p>
        <div id="question-area" style="display:none">
          <p id="question-text" class="question-text"></p>
          <div id="options-row" class="options-row">
            <div id="opt-1" class="option-card"></div>
            <div id="opt-2" class="option-card"></div>
            <div id="opt-3" class="option-card"></div>
          </div>
        </div>
        <p id="timer" class="muted"></p>
        <div class="timer-track"><div id="timer-bar" class="timer-bar"></div></div>
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

  const setStatusLobby = (text: string) => {
    const el = document.querySelector<HTMLParagraphElement>("#status-lobby");
    if (el) el.textContent = text;
  };
  const setStateLobby = (text: string) => {
    const el = document.querySelector<HTMLParagraphElement>("#state-lobby");
    if (el) el.textContent = text;
  };
  const setStatusGame = (text: string) => {
    const el = document.querySelector<HTMLParagraphElement>("#status-game");
    if (el) el.textContent = text;
  };
  const setStateGame = (text: string) => {
    const el = document.querySelector<HTMLParagraphElement>("#state-game");
    if (el) el.textContent = text;
  };
  const setTimer = (text: string) => {
    const timer = document.querySelector<HTMLParagraphElement>("#timer");
    if (timer) timer.textContent = text;
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

  const renderQuestion = (room: RoomState) => {
    const area = document.querySelector<HTMLDivElement>("#question-area");
    const qText = document.querySelector<HTMLParagraphElement>("#question-text");
    if (!area || !qText) return;

    if (!room.currentQuestion || room.phase === "lobby" || room.phase === "finished") {
      area.style.display = "none";
      return;
    }

    area.style.display = "";
    qText.textContent = room.currentQuestion.text;

    for (let i = 0; i < 3; i++) {
      const card = document.querySelector<HTMLDivElement>(`#opt-${i + 1}`);
      if (!card) continue;
      card.textContent = room.currentQuestion.options[i];
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

  setupBaseEvents(setStatusGame);
  let lastDeadline: number | null = null;
  let currentPhase: RoomState["phase"] = "lobby";
  let timerId: number | null = null;

  const restartTimer = (deadlineTs: number | null, phase: RoomState["phase"]) => {
    lastDeadline = deadlineTs;
    currentPhase = phase;
    if (timerId) window.clearInterval(timerId);
    const tick = () => {
      setTimer(`Таймер: ${formatSecondsLeft(lastDeadline)}с`);
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
    setStatusLobby(`Комната создана: ${payload.roomCode}`);
    setStateLobby("Отправь код комнаты игрокам.");
    deckSelect.style.display = "none";
    createBtn.style.display = "none";
    startBtn.style.display = "";
  });

  socket.off(SERVER_TO_CLIENT.roomUpdated);
  socket.on(SERVER_TO_CLIENT.roomUpdated, (room: RoomState) => {
    setRoomCode(room.roomCode);
    showSection(room.phase);
    const a = room.playerA ? `${room.playerA.nickname} (${room.playerA.score})` : "ожидаем";
    const b = room.playerB ? `${room.playerB.nickname} (${room.playerB.score})` : "ожидаем";
    setStatusLobby(`Код: ${room.roomCode} | A: ${a} | B: ${b}`);
    setStatusGame(`Код: ${room.roomCode} | A: ${a} | B: ${b}`);
    setStateGame(`Фаза: ${room.phase} | Раунд: ${Math.min(room.currentRoundIndex + 1, room.deckSize)}/${room.deckSize}`);
    setPhaseVisual(room.phase);
    restartTimer(room.phaseDeadlineTs, room.phase);
    renderQuestion(room);
  });

  setPhaseVisual("lobby");
  restartTimer(null, "lobby");
}
