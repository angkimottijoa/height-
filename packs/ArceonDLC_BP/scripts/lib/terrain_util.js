/*
 * Small helpers shared by the terrain brushes.
 */

/** Arceon's [min],[max] pick: a random whole number between the two (Random.nextInt). */
export function pickInt(a, b) {
    a = Number(a) || 0;
    b = Number(b) || 0;
    if (a === b)
        return a;
    const lo = Math.min(a, b);
    return Math.floor(Math.random() * Math.trunc(Math.abs(b - a) + 1)) + lo;
}

/** Arceon's [min],[max] pick with ThreadLocalRandom.nextDouble(|b-a|+1) + min. */
export function pickFloat(a, b) {
    a = Number(a) || 0;
    b = Number(b) || 0;
    if (a === b)
        return a;
    return Math.random() * (Math.abs(b - a) + 1) + Math.min(a, b);
}

/** Set a block from a pattern at a float position (floored). */
export function putPat(edit, pat, p) {
    const q = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
    edit.set(q, pat.at(q, edit));
    return q;
}
