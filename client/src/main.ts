import { renderHost } from "./host";
import { renderMobile } from "./play";
import { bootPixiHint } from "./pixiHint";
import { socket } from "./socket";
import { myRole, roomCode } from "./state";
import { CLIENT_TO_SERVER } from "./events";

const appEl = document.querySelector<HTMLDivElement>("#app")!;
const path = window.location.pathname;

socket.on("connect", () => {
  if (!roomCode) return;
  const nickname = localStorage.getItem("lastNickname") ?? undefined;
  socket.emit(CLIENT_TO_SERVER.clientReconnectRoom, { roomCode, roleHint: myRole ?? undefined, nickname });
});

if (path.startsWith("/host")) {
  renderHost(appEl);
} else if (path.startsWith("/play")) {
  renderMobile(appEl);
} else {
  appEl.innerHTML = `
    <div class="panel">
      <h2>AATE</h2>
      <p class="muted">Открой /host для главного экрана или /play для телефона.</p>
    </div>
  `;
}

void bootPixiHint();
