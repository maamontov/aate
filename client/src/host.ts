import { setupBaseEvents } from "./baseEvents";
import { CLIENT_TO_SERVER, SERVER_TO_CLIENT } from "./events";
import { socket } from "./socket";
import { roomCode, setMyRole, setRoomCode } from "./state";
import { formatSecondsLeft, phaseColor, progressPercent } from "./timer";
import type { RoomState } from "./types";

export function renderHost(appEl: HTMLDivElement): void {
  appEl.innerHTML = `
    <div id="host-panel" class="panel">
      <h2>AATE — Host</h2>
      <p class="muted">Создание комнаты и управление матчем.</p>
      <button id="create10">Создать комнату (10)</button>
      <button id="create20">Создать комнату (20)</button>
      <button id="create40">Создать комнату (40)</button>
      <button id="start">Старт матча</button>
      <hr />
      <p id="status" class="muted"></p>
      <p id="state" class="muted"></p>
      <p id="timer" class="muted"></p>
      <div class="timer-track"><div id="timer-bar" class="timer-bar"></div></div>
    </div>
  `;

  const setStatus = (text: string) => {
    const status = document.querySelector<HTMLParagraphElement>("#status");
    if (status) status.textContent = text;
  };
  const setState = (text: string) => {
    const state = document.querySelector<HTMLParagraphElement>("#state");
    if (state) state.textContent = text;
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
  setupBaseEvents(setStatus);
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

  (document.querySelector("#create10") as HTMLButtonElement).onclick = () => socket.emit(CLIENT_TO_SERVER.hostCreateRoom, { deckSize: 10 });
  (document.querySelector("#create20") as HTMLButtonElement).onclick = () => socket.emit(CLIENT_TO_SERVER.hostCreateRoom, { deckSize: 20 });
  (document.querySelector("#create40") as HTMLButtonElement).onclick = () => socket.emit(CLIENT_TO_SERVER.hostCreateRoom, { deckSize: 40 });
  (document.querySelector("#start") as HTMLButtonElement).onclick = () => socket.emit(CLIENT_TO_SERVER.hostStartMatch, { roomCode });

  socket.off(SERVER_TO_CLIENT.roomCreated);
  socket.on(SERVER_TO_CLIENT.roomCreated, (payload: { roomCode: string }) => {
    setRoomCode(payload.roomCode);
    setMyRole("host");
    setStatus(`Комната создана: ${payload.roomCode}`);
    setState("Отправь код комнаты игрокам.");
  });

  socket.off(SERVER_TO_CLIENT.roomUpdated);
  socket.on(SERVER_TO_CLIENT.roomUpdated, (room: RoomState) => {
    setRoomCode(room.roomCode);
    const a = room.playerA ? `${room.playerA.nickname} (${room.playerA.score})` : "ожидаем";
    const b = room.playerB ? `${room.playerB.nickname} (${room.playerB.score})` : "ожидаем";
    setStatus(`Код: ${room.roomCode} | A: ${a} | B: ${b}`);
    setState(`Фаза: ${room.phase} | Раунд: ${Math.min(room.currentRoundIndex + 1, room.deckSize)}/${room.deckSize}`);
    setPhaseVisual(room.phase);
    restartTimer(room.phaseDeadlineTs, room.phase);
  });

  setPhaseVisual("lobby");
  restartTimer(null, "lobby");
}
