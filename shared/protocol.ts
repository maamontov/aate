export type DeckSize = 10 | 15 | 20 | 40;
export type Role = "host" | "playerA" | "playerB";
export type Phase = "lobby" | "question" | "answering" | "guessing" | "reveal" | "finished";

export type PublicPlayerState = {
  nickname: string;
  score: number;
};

export type PublicRoomState = {
  roomCode: string;
  phase: Phase;
  deckSize: DeckSize;
  playerA: PublicPlayerState | null;
  playerB: PublicPlayerState | null;
  activePlayer: "playerA" | "playerB";
  currentRoundIndex: number;
  phaseDeadlineTs: number | null;
  paused: boolean;
  pauseDeadlineTs: number | null;
  winner: "playerA" | "playerB" | "draw" | null;
  currentQuestion: { text: string; options: [string, string, string] } | null;
  activeAnswer: 1 | 2 | 3 | null;
  guessAnswer: 1 | 2 | 3 | null;
};

export const CLIENT_TO_SERVER = {
  hostCreateRoom: "host:create_room",
  playerJoinRoom: "player:join_room",
  hostStartMatch: "host:start_match",
  playerSubmitActiveAnswer: "player:submit_active_answer",
  playerSubmitGuessAnswer: "player:submit_guess_answer",
  clientReconnectRoom: "client:reconnect_room"
} as const;

export const SERVER_TO_CLIENT = {
  roomCreated: "room:created",
  roomUpdated: "room:updated",
  roomPauseState: "room:pause_state",
  roomPeerDisconnected: "room:peer_disconnected",
  playerJoined: "player:joined",
  matchStarted: "match:started",
  roundPhaseChanged: "round:phase_changed",
  roundRevealed: "round:revealed",
  matchFinished: "match:finished",
  errorDomain: "error:domain"
} as const;
