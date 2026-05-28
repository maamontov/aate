import type { Phase } from "./types";

const PHASE_MS: Record<Phase, number> = {
  lobby: 0,
  question: 2_000,
  answering: 15_000,
  guessing: 15_000,
  reveal: 4_000,
  finished: 0
};

export function formatSecondsLeft(deadlineTs: number | null): string {
  if (!deadlineTs) return "--";
  return String(Math.max(0, Math.ceil((deadlineTs - Date.now()) / 1000)));
}

export function progressPercent(phase: Phase, deadlineTs: number | null): number {
  const total = PHASE_MS[phase];
  if (!deadlineTs || total <= 0) return 0;
  const left = Math.max(0, deadlineTs - Date.now());
  const done = total - left;
  return Math.max(0, Math.min(100, (done / total) * 100));
}

export function phaseColor(phase: Phase): string {
  if (phase === "question") return "#2f80ed"; // blue
  if (phase === "answering") return "#f2c94c"; // yellow
  if (phase === "guessing") return "#eb5757"; // red
  if (phase === "reveal") return "#27ae60"; // green
  return "#666";
}
