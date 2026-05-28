import type { Role } from "./types";

export let roomCode = "";
export let myRole: Role | null = null;

export function setRoomCode(code: string): void {
  roomCode = code;
}

export function setMyRole(role: Role | null): void {
  myRole = role;
}

export function resetState(): void {
  roomCode = "";
  myRole = null;
}
