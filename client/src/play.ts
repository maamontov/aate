import { setupBaseEvents } from "./baseEvents";
import { CLIENT_TO_SERVER, SERVER_TO_CLIENT } from "./events";
import { socket } from "./socket";
import { myRole, resetState, roomCode, setMyRole, setRoomCode } from "./state";
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

export function renderMobile(appEl: HTMLDivElement, reconnect: boolean): void {
  const last = localStorage.getItem("lastNickname") ?? "";
  appEl.innerHTML = `
    <div id="mobile-panel" class="panel">
      <div id="section-connect">
        <input id="nickname" placeholder="Ник" value="${last}" />
        <input id="room" placeholder="Код комнаты" />
        <button id="join">Войти в комнату</button>
        <p id="status-connect" class="muted"></p>
      </div>

      <div id="section-game" style="display:none">
        <p id="room-info" class="muted"></p>
        <p id="status-game" class="muted"></p>
        <p id="phase-timer" class="phase-timer"></p>
        <div class="timer-track"><div id="timer-bar" class="timer-bar"></div></div>
        <div id="choices" class="row"></div>
        <button id="disconnect" class="secondary">Отключиться</button>
      </div>
    </div>
  `;

  const showSection = (section: "connect" | "game") => {
    const connect = document.querySelector<HTMLDivElement>("#section-connect");
    const game = document.querySelector<HTMLDivElement>("#section-game");
    if (!connect || !game) return;
    if (section === "connect") {
      connect.style.display = "";
      game.style.display = "none";
    } else {
      connect.style.display = "none";
      game.style.display = "";
    }
  };

  const setStatusConnect = (text: string) => {
    const el = document.querySelector<HTMLParagraphElement>("#status-connect");
    if (el) el.textContent = text;
  };
  const setStatusGame = (text: string) => {
    const el = document.querySelector<HTMLParagraphElement>("#status-game");
    if (el) el.textContent = text;
  };
  const setPhaseTimer = (text: string) => {
    const el = document.querySelector<HTMLParagraphElement>("#phase-timer");
    if (el) el.textContent = text;
  };
  const setTimerBar = (percent: number, color: string) => {
    const bar = document.querySelector<HTMLDivElement>("#timer-bar");
    if (!bar) return;
    bar.style.width = `${percent}%`;
    bar.style.background = color;
  };
  const setRoomInfo = (code: string) => {
    const el = document.querySelector<HTMLParagraphElement>("#room-info");
    if (el) el.textContent = `Код комнаты: ${code}`;
  };
  const setPhaseVisual = (phase: RoomState["phase"]) => {
    const panel = document.querySelector<HTMLDivElement>("#mobile-panel");
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
  let lastDeadline: number | null = null;
  let currentPhase: RoomState["phase"] = "lobby";
  let timerId: number | null = null;
  const restartTimer = (deadlineTs: number | null, phase: RoomState["phase"]) => {
    lastDeadline = deadlineTs;
    currentPhase = phase;
    if (timerId) window.clearInterval(timerId);
    const tick = () => {
      const label = PHASE_LABELS[currentPhase] ?? currentPhase;
      const seconds = formatSecondsLeft(lastDeadline);
      setPhaseTimer(`${label} · ${seconds}с`);
      setTimerBar(progressPercent(currentPhase, lastDeadline), phaseColor(currentPhase));
    };
    tick();
    if (deadlineTs && phase !== "lobby" && phase !== "finished") timerId = window.setInterval(tick, 500);
  };

  const renderChoices = (phase: RoomState["phase"], activePlayer: "playerA" | "playerB") => {
    const c = document.querySelector<HTMLDivElement>("#choices");
    if (!c || !roomCode || !myRole) return;
    c.innerHTML = "";
    const iAmActive = myRole === activePlayer;
    const canAnswer = phase === "answering" && iAmActive;
    const canGuess = phase === "guessing" && !iAmActive && myRole !== "host";
    if (!canAnswer && !canGuess) return;
    c.innerHTML = `<button id="a1">1</button><button id="a2">2</button><button id="a3">3</button>`;
    (document.querySelector("#a1") as HTMLButtonElement).onclick = () =>
      socket.emit(canAnswer ? CLIENT_TO_SERVER.playerSubmitActiveAnswer : CLIENT_TO_SERVER.playerSubmitGuessAnswer, { roomCode, value: 1 });
    (document.querySelector("#a2") as HTMLButtonElement).onclick = () =>
      socket.emit(canAnswer ? CLIENT_TO_SERVER.playerSubmitActiveAnswer : CLIENT_TO_SERVER.playerSubmitGuessAnswer, { roomCode, value: 2 });
    (document.querySelector("#a3") as HTMLButtonElement).onclick = () =>
      socket.emit(canAnswer ? CLIENT_TO_SERVER.playerSubmitActiveAnswer : CLIENT_TO_SERVER.playerSubmitGuessAnswer, { roomCode, value: 3 });
  };

  // Ошибки показываем на текущем активном экране
  const isConnectVisible = () => {
    const el = document.querySelector<HTMLDivElement>("#section-connect");
    return el && el.style.display !== "none";
  };
  const setStatusDynamic = (text: string) => {
    if (isConnectVisible()) setStatusConnect(text);
    else setStatusGame(text);
  };
  setupBaseEvents(setStatusDynamic);

  // --- Подключение ---
  (document.querySelector("#join") as HTMLButtonElement).onclick = () => {
    const nickname = (document.querySelector("#nickname") as HTMLInputElement).value.trim();
    const code = (document.querySelector("#room") as HTMLInputElement).value.trim().toUpperCase();
    if (!nickname || !code) {
      setStatusConnect("Введите ник и код комнаты.");
      return;
    }
    setRoomCode(code);
    localStorage.setItem("lastNickname", nickname);
    socket.emit(CLIENT_TO_SERVER.playerJoinRoom, { roomCode: code, nickname });
  };

  // --- Отключение ---
  (document.querySelector("#disconnect") as HTMLButtonElement).onclick = () => {
    socket.disconnect();
    resetState();
    if (timerId) window.clearInterval(timerId);
    timerId = null;
    showSection("connect");
    setStatusConnect("Отключено.");
    socket.connect();
  };

  // --- События ---
  socket.off(SERVER_TO_CLIENT.playerJoined);
  socket.on(SERVER_TO_CLIENT.playerJoined, (payload: { role: "playerA" | "playerB"; roomCode: string }) => {
    setMyRole(payload.role);
    setRoomCode(payload.roomCode);
    setRoomInfo(payload.roomCode);
    setStatusGame(`Подключен как ${payload.role}`);
    showSection("game");
  });

  socket.off(SERVER_TO_CLIENT.roomUpdated);
  socket.on(SERVER_TO_CLIENT.roomUpdated, (room: RoomState) => {
    if (roomCode && room.roomCode !== roomCode) return;
    setRoomInfo(room.roomCode);
    const activeNick = room.activePlayer === "playerA" ? room.playerA?.nickname : room.playerB?.nickname;
    setStatusGame(`Ход: ${activeNick ?? room.activePlayer}`);
    if (room.phase === "finished") setStatusGame(`Матч завершен. Победитель: ${room.winner ?? "не определен"}`);
    setPhaseVisual(room.phase);
    restartTimer(room.phaseDeadlineTs, room.phase);
    renderChoices(room.phase, room.activePlayer);
  });

  // --- Начальное состояние ---
  setPhaseVisual("lobby");
  restartTimer(null, "lobby");

  if (reconnect) {
    showSection("game");
    setRoomInfo(roomCode);
  }
}
