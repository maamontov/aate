import type { DeckSize, Role, Phase } from "../../shared/protocol.js";

export type { DeckSize, Role, Phase };

export interface Question {
  id: string;
  text: string;
  options: [string, string, string];
  tags?: string[];
}

export interface PlayerState {
  socketId: string;
  nickname: string;
  score: number;
}

export interface RoomState {
  roomCode: string;
  deckSize: DeckSize;
  phase: Phase;
  hostSocketId: string;
  playerA: PlayerState | null;
  playerB: PlayerState | null;
  questions: Question[];
  currentRoundIndex: number;
  activePlayer: "playerA" | "playerB";
  activeAnswer: 1 | 2 | 3 | null;
  guessAnswer: 1 | 2 | 3 | null;
  phaseDeadlineTs: number | null;
  paused: boolean;
  pauseDeadlineTs: number | null;
  winner: "playerA" | "playerB" | "draw" | null;
}
