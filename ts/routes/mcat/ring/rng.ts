// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Deals items in shuffled order; refills when empty, guarding against an
 * immediate repeat across the refill boundary. */
export class ShuffleBag<T> {
    private pool: T[];
    private bag: T[] = [];
    private last: T | undefined;

    constructor(items: T[], private rng: () => number) {
        this.pool = [...items];
    }

    next(): T {
        if (this.bag.length === 0) {
            this.bag = [...this.pool];
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = Math.floor(this.rng() * (i + 1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
            if (this.pool.length > 1 && this.bag[this.bag.length - 1] === this.last) {
                [this.bag[0], this.bag[this.bag.length - 1]] = [
                    this.bag[this.bag.length - 1],
                    this.bag[0],
                ];
            }
        }
        this.last = this.bag.pop()!;
        return this.last;
    }
}

/** Deterministic unsigned 32-bit hash of a card id (+salt) for stable
 * cosmetic picks (consumers use it modulo a pool size). */
export function hashId(id: bigint, salt = 0): number {
    let h = Number(((id % 2147483647n) + 2147483647n) % 2147483647n) ^ (salt * 2654435761);
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return (h ^ (h >>> 16)) >>> 0;
}
