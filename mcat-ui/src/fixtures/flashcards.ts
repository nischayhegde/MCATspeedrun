import type { Flashcard } from "../lib/types";

// SAMPLE flashcards. The parser's flashcards.py output is not yet generated, so
// these are hand-authored placeholders (term -> description) to exercise the
// flashcard/self-grade review mode. Replace with flashcards.deduped.jsonl output.
export const FLASHCARDS: Flashcard[] = [
    {
        id: "fc-1",
        term: "Coding vs. template strand",
        description:
            "The coding (sense) strand matches the mRNA sequence (with T->U); the template (antisense/noncoding) strand is what RNA polymerase reads 3'->5' to build mRNA.",
        leafId: "1B",
        section: "BBLS",
    },
    {
        id: "fc-2",
        term: "Michaelis constant (Km)",
        description:
            "Substrate concentration at which reaction rate is half of Vmax. Low Km = high affinity. Competitive inhibitors raise apparent Km; Vmax unchanged.",
        leafId: "1A",
        section: "BBLS",
    },
    {
        id: "fc-3",
        term: "Glycolysis net yield",
        description: "Per glucose: 2 ATP (net), 2 NADH, 2 pyruvate. Occurs in the cytosol; does not require oxygen.",
        leafId: "1D",
        section: "BBLS",
    },
    {
        id: "fc-4",
        term: "Henderson-Hasselbalch",
        description:
            "pH = pKa + log([A-]/[HA]). When [A-] = [HA], pH = pKa. Buffers resist pH change best within +/-1 of pKa.",
        leafId: "5A",
        section: "CPBS",
    },
    {
        id: "fc-5",
        term: "Operant vs. classical conditioning",
        description:
            "Classical: an involuntary response is paired with a neutral stimulus (Pavlov). Operant: voluntary behavior is shaped by reinforcement/punishment (Skinner).",
        leafId: "7A",
        section: "PSBB",
    },
    {
        id: "fc-6",
        term: "Nernst / electrochemical driving force",
        description:
            "The equilibrium potential for an ion depends on its concentration gradient (Nernst equation). Net driving force = membrane potential minus that ion's equilibrium potential.",
        leafId: "4C",
        section: "CPBS",
    },
];
