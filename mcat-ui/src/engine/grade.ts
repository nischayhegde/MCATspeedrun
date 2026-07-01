// Records a single review: maps the raw signal to an FSRS grade, updates the
// card's memory state, and appends a review-log row. MCQ/application items are
// auto-graded from correctness + latency; flashcards use the learner's self
// rating. First-exposure failures are logged as "productive failure" so the
// aggregator can treat them as instruction rather than a memory lapse.
import { gradeMcq, type ItemKind } from "../lib/scoring";
import type { Rating } from "../lib/types";
import { newCardState, updateState } from "./fsrs";
import type { Card, EngineState, Grade, RevlogEntry } from "./model";
import { DAY_MS, RATING_TO_GRADE } from "./model";

export interface ReviewInput {
    correct?: boolean; // objective items
    ms: number;
    selfRating?: Rating; // flashcards
}

export function itemKindFor(card: Card): ItemKind {
    if (card.isCars) { return "cars"; }
    if (card.kind === "flashcard") { return "flashcard"; }
    return card.isApplication ? "application" : "discrete";
}

export function recordReview(
    state: EngineState,
    cardId: string,
    input: ReviewInput,
    now: number,
    requestRetention = 0.9,
): RevlogEntry {
    const card = state.cards[cardId];
    if (!card) { throw new Error(`recordReview: unknown card ${cardId}`); }
    const prev = state.fsrs[cardId] ?? newCardState(now);

    let grade: Grade;
    let correct: boolean;
    if (card.kind === "flashcard") {
        const r: Rating = input.selfRating ?? "again";
        grade = RATING_TO_GRADE[r];
        correct = r !== "again";
    } else {
        correct = !!input.correct;
        grade = RATING_TO_GRADE[gradeMcq(correct, input.ms, itemKindFor(card)).rating];
    }

    const elapsedDays = prev.lastReview ? (now - prev.lastReview) / DAY_MS : 0;
    const massed = prev.reps > 0 && elapsedDays < 1;
    const productiveFailure = !correct && prev.reps === 0;

    if (card.kind === "flashcard") {
        // rote cards are re-shown -> full FSRS scheduling
        state.fsrs[cardId] = updateState(prev, grade, now, requestRetention).state;
    } else {
        // application MCQs are fresh-every-time; log + mark seen but don't reschedule
        state.fsrs[cardId] = { ...prev, reps: prev.reps + 1, lastReview: now, due: now };
    }

    const entry: RevlogEntry = {
        cardId,
        leafId: card.leafId,
        ts: now,
        grade,
        correct,
        ms: input.ms,
        kind: card.kind,
        isApplication: card.isApplication,
        isCars: card.isCars,
        elapsedDays,
        massed,
        productiveFailure,
    };
    state.revlog.push(entry);
    return entry;
}
