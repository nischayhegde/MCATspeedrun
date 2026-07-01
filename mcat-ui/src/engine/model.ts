// Core data model for the study engine. Deliberately framework-free so the same
// logic can be ported into Anki's Rust backend (rslib) later. The names mirror
// Anki concepts where possible: a Card is the schedulable unit, RevlogEntry is a
// review-log row, and FsrsCardState is the per-card memory state.
import type { SectionCode } from "../lib/taxonomy";

export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy (FSRS convention)

export const RATING_TO_GRADE = { again: 1, hard: 2, good: 3, easy: 4 } as const;
export const GRADE_TO_RATING = ["", "again", "hard", "good", "easy"] as const;

export type CardKind = "flashcard" | "mcq";

// A schedulable item. `mcq` items that test application are marked isApplication;
// CARS items are application-only (isCars).
export interface Card {
    id: string;
    leafId: string; // content category id ("1B") or CARS skill ("CARS1")
    section: SectionCode;
    kind: CardKind;
    isApplication: boolean;
    isCars: boolean;
    difficulty: number; // question difficulty 1..5 (MCQ); 3 for rote
}

export type FsrsPhase = "new" | "review" | "relearning";

export interface FsrsCardState {
    stability: number; // days for retrievability to fall to requestRetention
    difficulty: number; // 1..10
    due: number; // epoch ms when next due
    lastReview: number; // epoch ms of last review (0 = never)
    reps: number;
    lapses: number;
    phase: FsrsPhase;
}

export interface RevlogEntry {
    cardId: string;
    leafId: string;
    ts: number; // epoch ms
    grade: Grade;
    correct: boolean;
    ms: number; // answer latency
    kind: CardKind;
    isApplication: boolean;
    isCars: boolean;
    elapsedDays: number; // since previous review of this card
    massed: boolean; // reviewed too soon (same-ish day) to count toward fluency
    productiveFailure: boolean; // failed on FIRST exposure -> instruction, not a lapse
}

export interface StudyConfig {
    newPerDay: number;
    maxReviews: number;
    requestRetention: number; // FSRS target retrievability (e.g. 0.9)
    sessionSize: number;
}

export const DEFAULT_CONFIG: StudyConfig = {
    newPerDay: 15,
    maxReviews: 120,
    requestRetention: 0.9,
    sessionSize: 12,
};

// The full mutable state the engine operates on (held by the store as $state).
export interface EngineState {
    cards: Record<string, Card>;
    fsrs: Record<string, FsrsCardState>;
    revlog: RevlogEntry[];
}

export const DAY_MS = 86_400_000;
