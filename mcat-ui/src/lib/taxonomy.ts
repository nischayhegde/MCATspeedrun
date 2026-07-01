// AAMC blueprint taxonomy + derived per-leaf readiness weights (w_i).
// Mirrors the PRD CONTENT TAXONOMY section. Tracked leaf = content category
// (31 CCs across the 3 science sections) + 3 CARS skills = 34 leaves.

export type SectionCode = "CPBS" | "BBLS" | "PSBB" | "CARS";

export interface SectionMeta {
    code: SectionCode;
    name: string;
    short: string;
}

export const SECTIONS: Record<SectionCode, SectionMeta> = {
    CPBS: { code: "CPBS", name: "Chemical & Physical Foundations", short: "Chem/Phys" },
    BBLS: { code: "BBLS", name: "Biological & Biochemical Foundations", short: "Bio/Biochem" },
    PSBB: { code: "PSBB", name: "Psychological, Social & Biological Foundations", short: "Psych/Soc" },
    CARS: { code: "CARS", name: "Critical Analysis & Reasoning Skills", short: "CARS" },
};

export const SECTION_ORDER: SectionCode[] = ["CPBS", "BBLS", "PSBB", "CARS"];

// Each science section contributes 1/4 of the composite; within a section the
// foundational-concept weight is split evenly across its content categories.
const SECTION_SHARE = 0.25;

interface FcDef {
    fc: string;
    section: SectionCode;
    weight: number; // fraction of its section
    ccs: { id: string; name: string }[];
}

const FCS: FcDef[] = [
    // Chem/Phys
    {
        fc: "FC4",
        section: "CPBS",
        weight: 0.4,
        ccs: [
            { id: "4A", name: "Motion, forces, work, energy, equilibrium" },
            { id: "4B", name: "Fluids & gas exchange" },
            { id: "4C", name: "Electrochemistry & circuits" },
            { id: "4D", name: "Light & sound" },
            { id: "4E", name: "Atoms, nuclear & electronic structure" },
        ],
    },
    {
        fc: "FC5",
        section: "CPBS",
        weight: 0.6,
        ccs: [
            { id: "5A", name: "Water & solutions (acid-base)" },
            { id: "5B", name: "Molecules & intermolecular forces" },
            { id: "5C", name: "Separations & purification" },
            { id: "5D", name: "Structure/reactivity of bio-molecules" },
            { id: "5E", name: "Thermodynamics & kinetics" },
        ],
    },
    // Bio/Biochem
    {
        fc: "FC1",
        section: "BBLS",
        weight: 0.55,
        ccs: [
            { id: "1A", name: "Proteins & amino acids" },
            { id: "1B", name: "Gene -> protein" },
            { id: "1C", name: "Heritable info & genetic diversity" },
            { id: "1D", name: "Bioenergetics & fuel metabolism" },
        ],
    },
    {
        fc: "FC2",
        section: "BBLS",
        weight: 0.2,
        ccs: [
            { id: "2A", name: "Assemblies of molecules/cells" },
            { id: "2B", name: "Prokaryotes & viruses" },
            { id: "2C", name: "Cell division & differentiation" },
        ],
    },
    {
        fc: "FC3",
        section: "BBLS",
        weight: 0.25,
        ccs: [
            { id: "3A", name: "Nervous & endocrine systems" },
            { id: "3B", name: "Other organ systems" },
        ],
    },
    // Psych/Soc
    {
        fc: "FC6",
        section: "PSBB",
        weight: 0.25,
        ccs: [
            { id: "6A", name: "Sensing the environment" },
            { id: "6B", name: "Making sense of the environment" },
            { id: "6C", name: "Responding to the world" },
        ],
    },
    {
        fc: "FC7",
        section: "PSBB",
        weight: 0.35,
        ccs: [
            { id: "7A", name: "Individual influences on behavior" },
            { id: "7B", name: "Social processes" },
            { id: "7C", name: "Attitude & behavior change" },
        ],
    },
    {
        fc: "FC8",
        section: "PSBB",
        weight: 0.2,
        ccs: [
            { id: "8A", name: "Self-identity" },
            { id: "8B", name: "Social thinking" },
            { id: "8C", name: "Social interactions" },
        ],
    },
    {
        fc: "FC9",
        section: "PSBB",
        weight: 0.15,
        ccs: [
            { id: "9A", name: "Social structure" },
            { id: "9B", name: "Demographics & processes" },
        ],
    },
    {
        fc: "FC10",
        section: "PSBB",
        weight: 0.05,
        ccs: [{ id: "10A", name: "Social inequality" }],
    },
];

// CARS: application-only skill leaves.
const CARS_SKILLS = [
    { id: "CARS1", name: "Foundations of Comprehension", weight: 0.3 },
    { id: "CARS2", name: "Reasoning Within the Text", weight: 0.3 },
    { id: "CARS3", name: "Reasoning Beyond the Text", weight: 0.4 },
];

export interface Leaf {
    id: string; // "1A" or "CARS1"
    name: string;
    section: SectionCode;
    fc: string | null;
    weight: number; // w_i, sums to ~1 across all leaves
    isCars: boolean; // application-only, no fluency gate
}

function buildLeaves(): Leaf[] {
    const leaves: Leaf[] = [];
    for (const fc of FCS) {
        for (const cc of fc.ccs) {
            leaves.push({
                id: cc.id,
                name: cc.name,
                section: fc.section,
                fc: fc.fc,
                weight: (SECTION_SHARE * fc.weight) / fc.ccs.length,
                isCars: false,
            });
        }
    }
    for (const s of CARS_SKILLS) {
        leaves.push({
            id: s.id,
            name: s.name,
            section: "CARS",
            fc: null,
            weight: SECTION_SHARE * s.weight,
            isCars: true,
        });
    }
    return leaves;
}

export const LEAVES: Leaf[] = buildLeaves();

export const LEAF_BY_ID: Record<string, Leaf> = Object.fromEntries(
    LEAVES.map((l) => [l.id, l]),
);
