import { socket } from "./socket";
import { SERVER_TO_CLIENT } from "./events";
import { formatSecondsLeft } from "./timer";

export function setupBaseEvents(setStatus: (text: string) => void): void {
  socket.off(SERVER_TO_CLIENT.errorDomain);
  socket.off(SERVER_TO_CLIENT.roomPeerDisconnected);
  socket.off(SERVER_TO_CLIENT.roomPauseState);
  socket.on(SERVER_TO_CLIENT.errorDomain, (e: { message: string }) => setStatus(`Ошибка: ${e.message}`));
  socket.on(SERVER_TO_CLIENT.roomPeerDisconnected, () => setStatus("Кто-то отключился. Матч на паузе до переподключения."));
  socket.on(SERVER_TO_CLIENT.roomPauseState, (e: { paused: boolean; pauseDeadlineTs: number | null }) => {
    if (e.paused && e.pauseDeadlineTs) {
      const seconds = formatSecondsLeft(e.pauseDeadlineTs);
      setStatus(`Пауза из-за отключения. До авто-завершения: ${seconds}с`);
    }
  });
}
