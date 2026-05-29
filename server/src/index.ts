import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Server } from "socket.io";
import type { Request, Response } from "express";
import type { Socket } from "socket.io";
import { CLIENT_TO_SERVER, SERVER_TO_CLIENT } from "./events.js";
import type { DeckSize, Question, RoomState } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json());
app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const rooms = new Map<string, RoomState>();
const timers = new Map<string, NodeJS.Timeout>();
const ANSWER_MS = 20_000;
const GUESS_MS = 20_000;
const REVEAL_MS = 5_000;

function randomRoomCode(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function loadQuestions(deckSize: DeckSize): Question[] {
  const filePath = resolve(process.cwd(), "..", "questions", "relations.ru.json");
  const allQuestions = JSON.parse(readFileSync(filePath, "utf8")) as Question[];
  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, deckSize);
}

function emitRoom(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  const q = room.questions[room.currentRoundIndex] ?? null;
  const publicState = {
    roomCode: room.roomCode,
    phase: room.phase,
    deckSize: room.deckSize,
    playerA: room.playerA ? { nickname: room.playerA.nickname, score: room.playerA.score } : null,
    playerB: room.playerB ? { nickname: room.playerB.nickname, score: room.playerB.score } : null,
    activePlayer: room.activePlayer,
    currentRoundIndex: room.currentRoundIndex,
    phaseDeadlineTs: room.phaseDeadlineTs,
    paused: room.paused,
    pauseDeadlineTs: room.pauseDeadlineTs,
    pausedBy: room.pausedBy,
    winner: room.winner,
    currentQuestion: q ? { text: q.text, options: q.options } : null,
    activeAnswer: room.activeAnswer,
    guessAnswer: room.guessAnswer,
  };
  io.to(roomCode).emit(SERVER_TO_CLIENT.roomUpdated, publicState);
}

function clearRoomTimer(roomCode: string): void {
  const timer = timers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    timers.delete(roomCode);
  }
}

function setPaused(roomCode: string, paused: boolean): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  room.paused = paused;
  room.pauseDeadlineTs = null;
  if (!paused) {
    room.pausedBy = null;
    room.pauseRemainingMs = null;
  }
  io.to(roomCode).emit(SERVER_TO_CLIENT.roomPauseState, { paused: room.paused, pauseDeadlineTs: room.pauseDeadlineTs });
  emitRoom(roomCode);
}

function currentQuestion(room: RoomState): Question | null {
  return room.questions[room.currentRoundIndex] ?? null;
}

function nextPhase(roomCode: string, phase: RoomState["phase"], ms: number): void {
  const room = rooms.get(roomCode);
  if (!room || room.paused) return;
  clearRoomTimer(roomCode);
  room.phase = phase;
  room.phaseDeadlineTs = Date.now() + ms;
  io.to(roomCode).emit(SERVER_TO_CLIENT.roundPhaseChanged, { phase, deadlineTs: room.phaseDeadlineTs });
  emitRoom(roomCode);
}

function scoreWinner(room: RoomState): void {
  if (!room.playerA || !room.playerB) {
    room.winner = null;
    return;
  }
  if (room.playerA.score > room.playerB.score) room.winner = "playerA";
  else if (room.playerB.score > room.playerA.score) room.winner = "playerB";
  else room.winner = "draw";
}

function startRound(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room || room.paused) return;
  if (!currentQuestion(room)) {
    room.phase = "finished";
    room.phaseDeadlineTs = null;
    scoreWinner(room);
    io.to(roomCode).emit(SERVER_TO_CLIENT.matchFinished, { winner: room.winner });
    emitRoom(roomCode);
    return;
  }

  room.activeAnswer = null;
  room.guessAnswer = null;
  nextPhase(roomCode, "question", 3_000);
  timers.set(
    roomCode,
    setTimeout(() => {
      nextPhase(roomCode, "answering", ANSWER_MS);
      timers.set(
        roomCode,
        setTimeout(() => {
          const r = rooms.get(roomCode);
          if (!r || r.phase !== "answering") return;
          nextPhase(roomCode, "guessing", GUESS_MS);
          timers.set(
            roomCode,
            setTimeout(() => {
              const rr = rooms.get(roomCode);
              if (!rr || rr.phase !== "guessing") return;
              revealRound(roomCode);
            }, GUESS_MS)
          );
        }, ANSWER_MS)
      );
    }, 3_000)
  );
}

function revealRound(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room || room.phase === "finished" || room.paused) return;
  clearRoomTimer(roomCode);
  room.phase = "reveal";
  room.phaseDeadlineTs = Date.now() + REVEAL_MS;
  if (room.activeAnswer && room.guessAnswer && room.activeAnswer === room.guessAnswer) {
    const guesser = room.activePlayer === "playerA" ? room.playerB : room.playerA;
    if (guesser) guesser.score += 1;
  }
  io.to(roomCode).emit(SERVER_TO_CLIENT.roundRevealed, { activeAnswer: room.activeAnswer, guessAnswer: room.guessAnswer });
  emitRoom(roomCode);
  timers.set(
    roomCode,
    setTimeout(() => {
      const r = rooms.get(roomCode);
      if (!r) return;
      r.currentRoundIndex += 1;
      if (r.currentRoundIndex >= r.deckSize) {
        r.phase = "finished";
        r.phaseDeadlineTs = null;
        scoreWinner(r);
        io.to(roomCode).emit(SERVER_TO_CLIENT.matchFinished, { winner: r.winner });
        emitRoom(roomCode);
        return;
      }
      r.activePlayer = r.activePlayer === "playerA" ? "playerB" : "playerA";
      startRound(roomCode);
    }, REVEAL_MS)
  );
}

function resumePhase(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room || room.paused) return;

  const remaining = room.pauseRemainingMs ?? 0;
  room.phaseDeadlineTs = Date.now() + remaining;
  room.pauseRemainingMs = null;

  if (remaining <= 0) {
    // Время фазы истекло — сразу переходим к следующей
    advancePhase(roomCode);
    return;
  }

  switch (room.phase) {
    case "question":
      timers.set(roomCode, setTimeout(() => advancePhase(roomCode), remaining));
      break;
    case "answering":
      timers.set(roomCode, setTimeout(() => {
        const r = rooms.get(roomCode);
        if (!r || r.phase !== "answering" || r.paused) return;
        nextPhase(roomCode, "guessing", GUESS_MS);
        timers.set(roomCode, setTimeout(() => {
          const rr = rooms.get(roomCode);
          if (!rr || rr.phase !== "guessing" || rr.paused) return;
          revealRound(roomCode);
        }, GUESS_MS));
      }, remaining));
      break;
    case "guessing":
      timers.set(roomCode, setTimeout(() => {
        const r = rooms.get(roomCode);
        if (!r || r.phase !== "guessing" || r.paused) return;
        revealRound(roomCode);
      }, remaining));
      break;
    case "reveal":
      timers.set(roomCode, setTimeout(() => {
        const r = rooms.get(roomCode);
        if (!r || r.paused) return;
        r.currentRoundIndex += 1;
        if (r.currentRoundIndex >= r.deckSize) {
          r.phase = "finished";
          r.phaseDeadlineTs = null;
          scoreWinner(r);
          io.to(roomCode).emit(SERVER_TO_CLIENT.matchFinished, { winner: r.winner });
          emitRoom(roomCode);
          return;
        }
        r.activePlayer = r.activePlayer === "playerA" ? "playerB" : "playerA";
        startRound(roomCode);
      }, remaining));
      break;
  }

  emitRoom(roomCode);
}

function advancePhase(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room || room.paused) return;

  switch (room.phase) {
    case "question":
      nextPhase(roomCode, "answering", ANSWER_MS);
      timers.set(roomCode, setTimeout(() => {
        const r = rooms.get(roomCode);
        if (!r || r.phase !== "answering" || r.paused) return;
        nextPhase(roomCode, "guessing", GUESS_MS);
        timers.set(roomCode, setTimeout(() => {
          const rr = rooms.get(roomCode);
          if (!rr || rr.phase !== "guessing" || rr.paused) return;
          revealRound(roomCode);
        }, GUESS_MS));
      }, ANSWER_MS));
      break;
    case "answering":
      nextPhase(roomCode, "guessing", GUESS_MS);
      timers.set(roomCode, setTimeout(() => {
        const r = rooms.get(roomCode);
        if (!r || r.phase !== "guessing" || r.paused) return;
        revealRound(roomCode);
      }, GUESS_MS));
      break;
    case "guessing":
      revealRound(roomCode);
      break;
    case "reveal":
      const r = rooms.get(roomCode);
      if (!r) return;
      r.currentRoundIndex += 1;
      if (r.currentRoundIndex >= r.deckSize) {
        r.phase = "finished";
        r.phaseDeadlineTs = null;
        scoreWinner(r);
        io.to(roomCode).emit(SERVER_TO_CLIENT.matchFinished, { winner: r.winner });
        emitRoom(roomCode);
        return;
      }
      r.activePlayer = r.activePlayer === "playerA" ? "playerB" : "playerA";
      startRound(roomCode);
      break;
  }
}

io.on("connection", (socket: Socket) => {
  socket.on(CLIENT_TO_SERVER.hostCreateRoom, ({ deckSize }: { deckSize: DeckSize }) => {
    const roomCode = randomRoomCode();
    const room: RoomState = {
      roomCode,
      deckSize,
      phase: "lobby",
      hostSocketId: socket.id,
      playerA: null,
      playerB: null,
      questions: [],
      currentRoundIndex: 0,
      activePlayer: "playerA",
      activeAnswer: null,
      guessAnswer: null,
      phaseDeadlineTs: null,
      paused: false,
      pauseDeadlineTs: null,
      pausedBy: null,
      pauseRemainingMs: null,
      winner: null
    };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.emit(SERVER_TO_CLIENT.roomCreated, { roomCode });
    emitRoom(roomCode);
  });

  socket.on(CLIENT_TO_SERVER.playerJoinRoom, ({ roomCode, nickname }: { roomCode: string; nickname: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return socket.emit(SERVER_TO_CLIENT.errorDomain, { message: "Комната не найдена" });
    setPaused(roomCode, false);
    if (!room.playerA) {
      room.playerA = { socketId: socket.id, nickname, score: 0 };
      socket.emit(SERVER_TO_CLIENT.playerJoined, { role: "playerA", roomCode });
    } else if (!room.playerB) {
      room.playerB = { socketId: socket.id, nickname, score: 0 };
      socket.emit(SERVER_TO_CLIENT.playerJoined, { role: "playerB", roomCode });
    }
    else return socket.emit(SERVER_TO_CLIENT.errorDomain, { message: "Комната заполнена" });
    socket.join(roomCode);
    emitRoom(roomCode);
  });

  socket.on(CLIENT_TO_SERVER.hostStartMatch, ({ roomCode }: { roomCode: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (!room.playerA || !room.playerB) return;
    room.questions = loadQuestions(room.deckSize);
    room.phase = "question";
    room.currentRoundIndex = 0;
    room.activePlayer = "playerA";
    room.activeAnswer = null;
    room.guessAnswer = null;
    room.winner = null;
    io.to(roomCode).emit(SERVER_TO_CLIENT.matchStarted);
    startRound(roomCode);
  });

  socket.on(CLIENT_TO_SERVER.playerSubmitActiveAnswer, ({ roomCode, value }: { roomCode: string; value: 1 | 2 | 3 }) => {
    const room = rooms.get(roomCode);
    if (!room || room.phase !== "answering") return;
    const mustBe = room.activePlayer === "playerA" ? room.playerA?.socketId : room.playerB?.socketId;
    if (mustBe !== socket.id) return;
    room.activeAnswer = value;
    clearRoomTimer(roomCode);
    nextPhase(roomCode, "guessing", GUESS_MS);
    timers.set(
      roomCode,
      setTimeout(() => {
        const r = rooms.get(roomCode);
        if (!r || r.phase !== "guessing") return;
        revealRound(roomCode);
      }, GUESS_MS)
    );
  });

  socket.on(CLIENT_TO_SERVER.playerSubmitGuessAnswer, ({ roomCode, value }: { roomCode: string; value: 1 | 2 | 3 }) => {
    const room = rooms.get(roomCode);
    if (!room || room.phase !== "guessing") return;
    const guesserSocketId = room.activePlayer === "playerA" ? room.playerB?.socketId : room.playerA?.socketId;
    if (guesserSocketId !== socket.id) return;
    room.guessAnswer = value;
    revealRound(roomCode);
  });

  socket.on(CLIENT_TO_SERVER.playerTogglePause, ({ roomCode }: { roomCode: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.phase === "lobby" || room.phase === "finished") return;

    const role: "playerA" | "playerB" | null =
      socket.id === room.playerA?.socketId ? "playerA" :
      socket.id === room.playerB?.socketId ? "playerB" : null;
    if (!role) return;

    if (!room.paused) {
      // Ставим на паузу
      room.paused = true;
      room.pausedBy = role;
      room.pauseRemainingMs = Math.max(0, (room.phaseDeadlineTs ?? 0) - Date.now());
      clearRoomTimer(roomCode);
    } else if (room.pausedBy === role) {
      // Снимаем паузу (только тот, кто поставил)
      room.paused = false;
      room.pausedBy = null;
      resumePhase(roomCode);
    } else {
      return; // другой игрок не может снять паузу
    }

    io.to(roomCode).emit(SERVER_TO_CLIENT.roomPauseState, { paused: room.paused, pauseDeadlineTs: room.pauseDeadlineTs });
    emitRoom(roomCode);
  });

  socket.on(
    CLIENT_TO_SERVER.clientReconnectRoom,
    ({ roomCode, roleHint, nickname }: { roomCode: string; roleHint?: "host" | "playerA" | "playerB"; nickname?: string }) => {
      const room = rooms.get(roomCode);
      if (!room) return socket.emit(SERVER_TO_CLIENT.errorDomain, { message: "Комната не найдена" });
      setPaused(roomCode, false);
      if (roleHint === "host") room.hostSocketId = socket.id;
      if (roleHint === "playerA" && room.playerA) room.playerA.socketId = socket.id;
      if (roleHint === "playerB" && room.playerB) room.playerB.socketId = socket.id;
      if (nickname && room.playerA?.nickname === nickname) room.playerA.socketId = socket.id;
      if (nickname && room.playerB?.nickname === nickname) room.playerB.socketId = socket.id;
      socket.join(roomCode);
      emitRoom(roomCode);
    }
  );

  socket.on("disconnect", () => {
    for (const [roomCode, room] of rooms.entries()) {
      const isHost = room.hostSocketId === socket.id;
      const isA = room.playerA?.socketId === socket.id;
      const isB = room.playerB?.socketId === socket.id;
      if (!isHost && !isA && !isB) continue;

      const isActive = room.phase !== "lobby" && room.phase !== "finished";

      if ((isA || isB) && isActive) {
        // Игрок отключился во время игры — сразу завершаем
        clearRoomTimer(roomCode);
        room.phase = "finished";
        room.phaseDeadlineTs = null;
        scoreWinner(room);
        io.to(roomCode).emit(SERVER_TO_CLIENT.matchFinished, { winner: room.winner, reason: "player_disconnect" });
        emitRoom(roomCode);
      } else if (isHost && isActive) {
        // Host отключился — сразу завершаем матч
        clearRoomTimer(roomCode);
        room.phase = "finished";
        room.phaseDeadlineTs = null;
        scoreWinner(room);
        io.to(roomCode).emit(SERVER_TO_CLIENT.matchFinished, { winner: room.winner, reason: "host_disconnect" });
        emitRoom(roomCode);
      }
      break;
    }
  });
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`AATE server listening on :${port}`);
});
