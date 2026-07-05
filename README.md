# Anki

[![Build Status](https://github.com/ankitects/anki/actions/workflows/ci.yml/badge.svg)](https://github.com/ankitects/anki/actions/workflows/ci.yml)
[![Documentation](https://img.shields.io/badge/docs-dev--docs.ankiweb.net-blue)](https://dev-docs.ankiweb.net)

This repo contains the source code for the computer version of
[Anki](https://apps.ankiweb.net).

## About

Anki is a spaced repetition program. Please see the [website](https://apps.ankiweb.net) to learn more.

## MCAT Speedrun

This fork targets the **MCAT**, scored 472–528 across four sections (each
118–132): Chemical/Physical Foundations, Biological/Biochemical Foundations,
Psychological/Social/Biological Foundations, and CARS. Study progress is
tracked per AAMC blueprint subtopic (34 leaves) and rolled up into a
blueprint-weighted readiness estimate — see `rslib/src/mcat/scoring.rs`.

**Give-up rule:** no readiness score is shown until the student has at least
200 graded MCAT reviews, at least 50% blueprint coverage, and at least one
assessed subtopic in every section. Below that bar the dashboard states
exactly what's missing instead of showing a number.

## Getting Started

### Contributing

Want to contribute to Anki? Check out the [Contribution Guidelines](./docs/contributing.md).

For more information on building and developing, please see [Development](./docs/development.md).

#### Contributors

The following people have contributed to Anki: [CONTRIBUTORS](./CONTRIBUTORS)

### Anki Betas

If you'd like to try development builds of Anki but don't feel comfortable
building the code, please see [Anki betas](https://betas.ankiweb.net/).

## License

Anki's license: [LICENSE](./LICENSE)
