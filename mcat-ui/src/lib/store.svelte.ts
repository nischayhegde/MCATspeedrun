// Reactive UI store. All algorithms/scoring/selection now live in ./engine; this
// file is a thin Svelte-5-runes wrapper that holds the engine state and maps
// engine output onto the screens. The public API is unchanged from the previous
// heuristic store so the screens keep working.
import {
    buildColdState,
    buildFixtures,
    buildQueue,
    buildSeededState,
    computeLeafScores,
    DEFAULT_CONFIG,
    type EngineState,
    type Fixtures,
    QUESTIONS as ENGINE_QUESTIONS,
    recordReview,
    type StudyConfig,
} from "../engine";
import { confidence, emptyLeafState, gradeMcq, masteryOf, readiness } from "./scoring";
import { LEAF_BY_ID, LEAVES } from "./taxonomy";
import type { Leaf } from "./taxonomy";
import type { Flashcard, LeafState, QuestionFixture, Rating } from "./types";

export const QUESTIONS = ENGINE_QUESTIONS;

export type Route =
    | "onboarding"
    | "diagnostic"
    | "diagResults"
    | "dashboard"
    | "review"
    | "feedback"
    | "tagBrowser"
    | "settings";

export type BoxerAction = "idle" | "jumprope" | "punch" | "block" | "hit";

interface DiagAnswer {
    qId: string;
    chosen: string;
    correct: boolean;
    ms: number;
    leafId: string;
    difficulty: number;
}

// A session item resolved to renderable content (looked up from the engine).
interface SessionItem {
    kind: "flashcard" | "application";
    card?: Flashcard;
    q?: QuestionFixture;
}

interface FeedbackData {
    q: QuestionFixture;
    chosen: string;
    correct: boolean;
    ms: number;
    rating: Rating;
}

const NOW0 = Date.now();

class AppStore {
    route = $state<Route>("dashboard");
    profile = $state({ targetScore: 515, targetDate: "2026-09-12", started: false });
    settings = $state({ boxerOn: true, newPerDay: 15, reviewsPerDay: 120, showTimer: true });

    // ---- engine state (single source of truth) -------------------------------
    private fx: Fixtures = buildFixtures();
    engine = $state<EngineState>(buildSeededState(NOW0));

    // memoized per-leaf scores; recomputes when the engine state changes.
    scoresMap = $derived(computeLeafScores(this.engine, Date.now()));

    boxer = $state<{ action: BoxerAction; nonce: number; oppSize: number }>({
        action: "idle",
        nonce: 0,
        oppSize: 3,
    });

    diag = $state<{
        items: QuestionFixture[];
        index: number;
        answers: DiagAnswer[];
        running: boolean;
        done: boolean;
        startedAt: number;
    }>({ items: [], index: 0, answers: [], running: false, done: false, startedAt: 0 });

    session = $state<{ queue: SessionItem[]; index: number; running: boolean; startedAt: number }>({
        queue: [],
        index: 0,
        running: false,
        startedAt: 0,
    });

    lastFeedback = $state<FeedbackData | null>(null);
    selectedLeaf = $state<string | null>(null);
    streak = $state(7);
    cardStartedAt = 0;

    private get config(): StudyConfig {
        return {
            ...DEFAULT_CONFIG,
            newPerDay: this.settings.newPerDay,
            maxReviews: this.settings.reviewsPerDay,
        };
    }

    // ---- derived -------------------------------------------------------------
    get readiness() {
        return readiness(this.scoresMap);
    }
    get confidence() {
        return confidence(this.scoresMap);
    }
    get userScale() {
        return 1 + (this.readiness.pct / 100) * 0.6;
    }

    leafState(id: string): LeafState {
        return this.scoresMap[id] ?? emptyLeafState(id);
    }
    mastery(leaf: Leaf): number {
        return masteryOf(leaf, this.scoresMap[leaf.id]);
    }

    get currentDiag(): QuestionFixture | null {
        return this.diag.items[this.diag.index] ?? null;
    }
    get currentItem(): SessionItem | null {
        return this.session.queue[this.session.index] ?? null;
    }

    // ---- navigation ----------------------------------------------------------
    go(r: Route) {
        this.route = r;
    }
    pickLeaf(id: string) {
        this.selectedLeaf = id;
        this.route = "tagBrowser";
    }

    private fireBoxer(action: BoxerAction, oppSize = this.boxer.oppSize) {
        this.boxer = { action, nonce: this.boxer.nonce + 1, oppSize };
    }

    // ---- diagnostic ----------------------------------------------------------
    startDiagnostic() {
        this.profile.started = true;
        this.engine = buildColdState(); // wipe history: the diagnostic is the cold start
        this.diag = {
            items: QUESTIONS.slice(),
            index: 0,
            answers: [],
            running: true,
            done: false,
            startedAt: Date.now(),
        };
        this.cardStartedAt = Date.now();
        this.route = "diagnostic";
    }

    answerDiagnostic(letter: string) {
        const q = this.currentDiag;
        if (!q) { return; }
        const ms = Date.now() - this.cardStartedAt;
        const correct = q.answer.letter === letter;
        const leafId = q.tags.contentCategory ?? "1A";
        this.diag.answers.push({ qId: q.id, chosen: letter, correct, ms, leafId, difficulty: q.difficulty });
        recordReview(this.engine, q.id, { correct, ms }, Date.now(), this.config.requestRetention);

        if (this.diag.index + 1 >= this.diag.items.length) {
            this.diag.running = false;
            this.diag.done = true;
            this.route = "diagResults";
        } else {
            this.diag.index += 1;
            this.cardStartedAt = Date.now();
        }
    }

    get diagScorePct(): number {
        const a = this.diag.answers;
        if (!a.length) { return 0; }
        return (a.filter((x) => x.correct).length / a.length) * 100;
    }

    // ---- study session -------------------------------------------------------
    startSession() {
        const queue = buildQueue(this.engine, this.scoresMap, this.fx.selectableIds, Date.now(), this.config);
        const items: SessionItem[] = queue.map((it) =>
            it.kind === "flashcard"
                ? { kind: "flashcard", card: this.fx.flashcardContent[it.cardId] }
                : { kind: "application", q: this.fx.questionContent[it.cardId] }
        );
        this.session = { queue: items, index: 0, running: true, startedAt: Date.now() };
        this.cardStartedAt = Date.now();
        this.routeForCurrent();
    }

    private routeForCurrent() {
        const item = this.currentItem;
        if (!item) {
            this.session.running = false;
            this.route = "dashboard";
            return;
        }
        if (item.kind === "flashcard") {
            this.fireBoxer("jumprope");
        } else {
            const opp = item.q ? item.q.difficulty : 3;
            this.boxer = { action: "idle", nonce: this.boxer.nonce + 1, oppSize: opp };
        }
        this.route = "review";
        this.cardStartedAt = Date.now();
    }

    answerApplication(letter: string) {
        const item = this.currentItem;
        if (!item || item.kind !== "application" || !item.q) { return; }
        const q = item.q;
        const ms = Date.now() - this.cardStartedAt;
        const correct = q.answer.letter === letter;
        const g = gradeMcq(correct, ms, "application");
        recordReview(this.engine, q.id, { correct, ms }, Date.now(), this.config.requestRetention);

        if (!correct) { this.fireBoxer("hit", q.difficulty); }
        else if (g.fast) { this.fireBoxer("punch", q.difficulty); }
        else { this.fireBoxer("block", q.difficulty); }

        this.lastFeedback = { q, chosen: letter, correct, ms, rating: g.rating };
        this.route = "feedback";
    }

    gradeFlashcard(rating: Rating) {
        const item = this.currentItem;
        if (!item || item.kind !== "flashcard" || !item.card) { return; }
        const ms = Date.now() - this.cardStartedAt;
        recordReview(this.engine, item.card.id, { selfRating: rating, ms }, Date.now(), this.config.requestRetention);
        this.advance();
    }

    feedbackContinue() {
        this.advance();
    }

    private advance() {
        if (this.session.index + 1 >= this.session.queue.length) {
            this.session.running = false;
            this.route = "dashboard";
            return;
        }
        this.session.index += 1;
        this.routeForCurrent();
    }
}

export const store = new AppStore();
