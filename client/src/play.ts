import { setupBaseEvents } from "./baseEvents";
import { CLIENT_TO_SERVER, SERVER_TO_CLIENT } from "./events";
import { socket } from "./socket";
import { myRole, roomCode, setMyRole, setRoomCode } from "./state";
import { formatSecondsLeft, phaseColor, progressPercent } from "./timer";
import type { RoomState } from "./types";

export function renderMobile(appEl: HTMLDivElement): void {
  const last = localStorage.getItem("lastNickname") ?? "";
  appEl.innerHTML = `
    <div id="mobile-panel" class="panel">
      <h2>AATE — Mobile</h2>
      <input id="nickname" placeholder="Ник" value="${last}" />
      <input id="room" placeholder="Код комнаты" />
      <button id="join">Войти в комнату</button>
      <p id="status" class="muted"></p>
      <p id="turn" class="muted"></p>
      <p id="timer" class="muted"></p>
      <div class="timer-track"><div id="timer-bar" class="timer-bar"></div></div>
      <div id="choices" class="row"></div>
    </div>
  `;
  const setStatus = (text: string) => {
    const status = document.querySelector<HTMLParagraphElement>("#status");
    if (status) status.textContent = text;
  };
  const setTurn = (text: string) => {
    const turn = document.querySelector<HTMLParagraphElement>("#turn");
    if (turn) turn.textContent = text;
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
      setTimer(`Таймер: ${formatSecondsLeft(lastDeadline)}с`);
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

  setupBaseEvents(setStatus);

  (document.querySelector("#join") as HTMLButtonElement).onclick = () => {
    const nickname = (document.querySelector("#nickname") as HTMLInputElement).value.trim();
    const code = (document.querySelector("#room") as HTMLInputElement).value.trim().toUpperCase();
    setRoomCode(code);
    localStorage.setItem("lastNickname", nickname);
    socket.emit(CLIENT_TO_SERVER.playerJoinRoom, { roomCode: code, nickname });
  };

  socket.off(SERVER_TO_CLIENT.playerJoined);
  socket.on(SERVER_TO_CLIENT.playerJoined, (payload: { role: "playerA" | "playerB"; roomCode: string }) => {
    setMyRole(payload.role);
    setRoomCode(payload.roomCode);
    setStatus(`Подключен как ${payload.role} в комнате ${payload.roomCode}`);
  });

  socket.off(SERVER_TO_CLIENT.roomUpdated);
  socket.on(SERVER_TO_CLIENT.roomUpdated, (room: RoomState) => {
    if (roomCode && room.roomCode !== roomCode) return;
    const activeNick = room.activePlayer === "playerA" ? room.playerA?.nickname : room.playerB?.nickname;
    setTurn(`Фаза: ${room.phase}. Ход: ${activeNick ?? room.activePlayer}`);
    if (room.phase === "finished") setStatus(`Матч завершен. Победитель: ${room.winner ?? "не определен"}`);
    setPhaseVisual(room.phase);
    restartTimer(room.phaseDeadlineTs, room.phase);
    renderChoices(room.phase, room.activePlayer);
  });

  setPhaseVisual("lobby");
  restartTimer(null, "lobby");
}
