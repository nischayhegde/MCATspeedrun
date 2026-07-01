// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! Maps a note's Anki tags to an MCAT leaf id (content category or CARS skill).
//!
//! Convention: content is tagged under an `mcat::` namespace, e.g.
//! `mcat::cc::1B` or `mcat::cars::CARS2`. Anki stores tags as a `Vec<String>`
//! with `::` denoting hierarchy, so we split on `::` and return the first
//! component that matches a known leaf id. A bare `1B` tag is also accepted.

use super::taxonomy::leaves;

/// Return the leaf id referenced by any of these tags, if present.
pub fn leaf_id_from_tags(tags: &[String]) -> Option<String> {
    let known: Vec<&'static str> = leaves().iter().map(|l| l.id).collect();
    for tag in tags {
        for part in tag.split("::") {
            let part = part.trim();
            if let Some(id) = known.iter().find(|id| id.eq_ignore_ascii_case(part)) {
                return Some((*id).to_string());
            }
        }
    }
    None
}

/// Whether a leaf id belongs to the CARS (application-only) section.
pub fn is_cars(leaf_id: &str) -> bool {
    super::taxonomy::leaf(leaf_id)
        .map(|l| l.is_cars)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_namespaced_leaf() {
        let tags = vec!["mcat::cc::1B".to_string(), "source::kaplan".to_string()];
        assert_eq!(leaf_id_from_tags(&tags).as_deref(), Some("1B"));
    }

    #[test]
    fn finds_cars_and_bare_tags() {
        assert_eq!(
            leaf_id_from_tags(&["mcat::cars::CARS2".to_string()]).as_deref(),
            Some("CARS2")
        );
        assert_eq!(
            leaf_id_from_tags(&["5d".to_string()]).as_deref(),
            Some("5D")
        );
    }

    #[test]
    fn none_when_absent() {
        assert_eq!(leaf_id_from_tags(&["biology".to_string()]), None);
        assert!(!is_cars("1B"));
        assert!(is_cars("CARS1"));
    }
}
