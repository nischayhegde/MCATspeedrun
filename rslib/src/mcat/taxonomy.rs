// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! AAMC blueprint taxonomy + derived per-leaf readiness weights (w_i).
//! Ported from `mcat-ui/src/lib/taxonomy.ts`. Tracked leaf = content category
//! (31 CCs across the 3 science sections) + 3 CARS skills = 34 leaves, with
//! weights summing to ~1.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Section {
    Cpbs,
    Bbls,
    Psbb,
    Cars,
}

#[derive(Clone, Debug)]
pub struct Leaf {
    pub id: &'static str,
    pub name: &'static str,
    pub section: Section,
    pub is_cars: bool,
    pub weight: f32,
    /// Foundational-concept group ("1".."10"; "CARS" for the CARS skills) —
    /// leaves in one group share a shrinkage prior (ability correlates most
    /// strongly within a concept).
    pub fc: &'static str,
}

/// Each science section contributes 1/4 of the composite; within a section the
/// foundational-concept weight is split evenly across its content categories.
const SECTION_SHARE: f32 = 0.25;

struct FcDef {
    section: Section,
    /// fraction of its section
    weight: f32,
    /// foundational-concept number ("1".."10")
    fc: &'static str,
    ccs: &'static [(&'static str, &'static str)],
}

const FCS: &[FcDef] = &[
    FcDef {
        section: Section::Cpbs,
        weight: 0.4,
        fc: "4",
        ccs: &[
            ("4A", "Motion, forces, work, energy, equilibrium"),
            ("4B", "Fluids & gas exchange"),
            ("4C", "Electrochemistry & circuits"),
            ("4D", "Light & sound"),
            ("4E", "Atoms, nuclear & electronic structure"),
        ],
    },
    FcDef {
        section: Section::Cpbs,
        weight: 0.6,
        fc: "5",
        ccs: &[
            ("5A", "Water & solutions (acid-base)"),
            ("5B", "Molecules & intermolecular forces"),
            ("5C", "Separations & purification"),
            ("5D", "Structure/reactivity of bio-molecules"),
            ("5E", "Thermodynamics & kinetics"),
        ],
    },
    FcDef {
        section: Section::Bbls,
        weight: 0.55,
        fc: "1",
        ccs: &[
            ("1A", "Proteins & amino acids"),
            ("1B", "Gene -> protein"),
            ("1C", "Heritable info & genetic diversity"),
            ("1D", "Bioenergetics & fuel metabolism"),
        ],
    },
    FcDef {
        section: Section::Bbls,
        weight: 0.2,
        fc: "2",
        ccs: &[
            ("2A", "Assemblies of molecules/cells"),
            ("2B", "Prokaryotes & viruses"),
            ("2C", "Cell division & differentiation"),
        ],
    },
    FcDef {
        section: Section::Bbls,
        weight: 0.25,
        fc: "3",
        ccs: &[
            ("3A", "Nervous & endocrine systems"),
            ("3B", "Other organ systems"),
        ],
    },
    FcDef {
        section: Section::Psbb,
        weight: 0.25,
        fc: "6",
        ccs: &[
            ("6A", "Sensing the environment"),
            ("6B", "Making sense of the environment"),
            ("6C", "Responding to the world"),
        ],
    },
    FcDef {
        section: Section::Psbb,
        weight: 0.35,
        fc: "7",
        ccs: &[
            ("7A", "Individual influences on behavior"),
            ("7B", "Social processes"),
            ("7C", "Attitude & behavior change"),
        ],
    },
    FcDef {
        section: Section::Psbb,
        weight: 0.2,
        fc: "8",
        ccs: &[
            ("8A", "Self-identity"),
            ("8B", "Social thinking"),
            ("8C", "Social interactions"),
        ],
    },
    FcDef {
        section: Section::Psbb,
        weight: 0.15,
        fc: "9",
        ccs: &[
            ("9A", "Social structure"),
            ("9B", "Demographics & processes"),
        ],
    },
    FcDef {
        section: Section::Psbb,
        weight: 0.05,
        fc: "10",
        ccs: &[("10A", "Social inequality")],
    },
];

const CARS_SKILLS: &[(&str, &str, f32)] = &[
    ("CARS1", "Foundations of Comprehension", 0.3),
    ("CARS2", "Reasoning Within the Text", 0.3),
    ("CARS3", "Reasoning Beyond the Text", 0.4),
];

/// All four MCAT sections, for coverage/give-up checks that need to iterate
/// every section (as opposed to every leaf).
pub const ALL_SECTIONS: [Section; 4] =
    [Section::Cpbs, Section::Bbls, Section::Psbb, Section::Cars];

/// Full display name for a section, for user-facing give-up-rule messages
/// (contrast with the short "C/P"/"B/B"/"P/S"/"CARS" labels used elsewhere).
pub fn section_full_name(section: Section) -> &'static str {
    match section {
        Section::Cpbs => "Chemical/Physical Foundations",
        Section::Bbls => "Biological/Biochemical Foundations",
        Section::Psbb => "Psychological/Social/Biological Foundations",
        Section::Cars => "CARS",
    }
}

/// Build the full leaf list with derived weights.
pub fn leaves() -> Vec<Leaf> {
    let mut out = Vec::with_capacity(34);
    for fc in FCS {
        let n = fc.ccs.len() as f32;
        for &(id, name) in fc.ccs {
            out.push(Leaf {
                id,
                name,
                section: fc.section,
                is_cars: false,
                weight: (SECTION_SHARE * fc.weight) / n,
                fc: fc.fc,
            });
        }
    }
    for &(id, name, w) in CARS_SKILLS {
        out.push(Leaf {
            id,
            name,
            section: Section::Cars,
            is_cars: true,
            weight: SECTION_SHARE * w,
            fc: "CARS",
        });
    }
    out
}

/// Look up a single leaf by id.
pub fn leaf(id: &str) -> Option<Leaf> {
    leaves().into_iter().find(|l| l.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thirty_four_leaves_with_three_cars() {
        let ls = leaves();
        assert_eq!(ls.len(), 34);
        assert_eq!(ls.iter().filter(|l| l.is_cars).count(), 3);
    }

    #[test]
    fn weights_sum_to_one() {
        let sum: f32 = leaves().iter().map(|l| l.weight).sum();
        assert!((sum - 1.0).abs() < 1e-4, "sum was {sum}");
    }
}
