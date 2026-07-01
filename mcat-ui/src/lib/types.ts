import type { SectionCode } from "./taxonomy";

export type Rating = "again" | "hard" | "good" | "easy";

export interface QuestionFixture {
    id: string;
    image: string;
    stem: string;
    choices: Record<string, string>;
    hasFigure: boolean;
    hasPassage: boolean;
    answer: { letter: string | null; explanation: string };
    tags: {
        section: string | null;
        discipline: string | null;
        foundationalConcept: string | null;
        contentCategory: string | null;
        skills: string[];
        subtopics: string[];
    };
    difficulty: number; // overall 1..5
}

export interface Flashcard {
    id: string;
    term: string;
    description: string;
    leafId: string; // content category id
    section: SectionCode;
}

export interface LeafState {
    id: string;
    fluency: number; // 0..1 (automaticity + durability of rote)
    application: number; // 0..1 (applied skill)
    attempts: number; // spaced attempts -> evidence depth
    freshness: number; // 0..1 recency proxy (FSRS retrievability stand-in)
    assessed: boolean;
    gateOpen: boolean; // fluency gate; always open for CARS
}
