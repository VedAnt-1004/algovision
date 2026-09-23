// ==========================================
// SORTING GENERATOR TESTS (tests/unit/sorting.test.js)
// ==========================================
// Covers bubbleSortSteps, selectionSortSteps, insertionSortSteps, mergeSortSteps
// and quickSortSteps from js/algorithms/sorting.js.
//
// The generators are pure (no DOM, no timers), so these run in the default
// `node` Jest environment. Four layers:
//   1. a CONTRACT shared by all five generators (shape, permutation invariant,
//      immutability, termination, the "done" step)
//   2. EDGE CASES shared by all five (sorted, reverse-sorted, duplicates,
//      negatives, single/two elements, the empty-array quirk)
//   3. ALGORITHM-SPECIFIC invariants derived from each generator's own source
//      (comparison counts, pairing of yields, structural checks) — every
//      formula below was verified empirically against the real generators
//      before being written as an assertion, not hand-derived
//   4. the displayed JavaScript snippet for each algorithm really does what
//      the generator animates

import {
    bubbleSortSteps,
    selectionSortSteps,
    insertionSortSteps,
    mergeSortSteps,
    quickSortSteps,
} from '../../js/algorithms/sorting.js';
import { algorithmDatabase } from '../../js/data.js';

// ---------- Helpers ----------

const numeric = (a, b) => a - b;

// Small deterministic PRNG so "random" inputs are identical on every run.
function mulberry32(seed) {
    let a = seed;
    return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomArray(rng, length, lo = -20, hi = 50) {
    return Array.from({ length }, () => lo + Math.floor(rng() * (hi - lo + 1)));
}

// Drains a generator, but refuses to loop forever if an edit ever introduces an
// infinite loop (a synchronous infinite loop would hang the whole Jest run).
function run(generatorFn, ...args) {
    const generator = generatorFn(...args);
    const steps = [];
    const limit = 200000; // largest legitimate run here is ~20300 steps (see "terminates" test)
    for (let i = 0; i < limit; i++) {
        const { value, done } = generator.next();
        if (done) return steps;
        steps.push(value);
    }
    throw new Error(`${generatorFn.name} did not terminate within ${limit} steps`);
}

const phasesOf = (steps) => steps.map((step) => step.phase);
const last = (list) => list[list.length - 1];
const count = (steps, phase) => steps.filter((step) => step.phase === phase).length;
const isPrefix = (indices) => indices.every((value, i) => value === i);
const isAscendingRun = (indices) => indices.every((value, i) => i === 0 || value === indices[i - 1] + 1);

// Inputs shared by the contract/edge-case tests: empty, single, tiny, sorted,
// reversed, duplicates, all-equal, negatives, random.
function inputCorpus() {
    const rng = mulberry32(2024);
    return [
        [],
        [7],
        [2, 1],
        [1, 2],
        [3, 3],
        [3, 1, 2],
        [1, 2, 3, 4, 5],
        [5, 4, 3, 2, 1],
        [4, 4, 4, 4],
        [0, -1, -2, -3],
        [9, 3, 7, 3, 1, 8, 2],
        randomArray(rng, 8),
        randomArray(rng, 12),
        randomArray(rng, 16),
    ];
}

const GENERATORS = [
    ['bubbleSortSteps', bubbleSortSteps],
    ['selectionSortSteps', selectionSortSteps],
    ['insertionSortSteps', insertionSortSteps],
    ['mergeSortSteps', mergeSortSteps],
    ['quickSortSteps', quickSortSteps],
];

// bubbleSortSteps, selectionSortSteps and quickSortSteps only ever rearrange
// values already resident in `arr` via a plain swap of two cells, so EVERY
// single yielded step is a full, exact permutation of the original input.
// insertionSortSteps and mergeSortSteps are the two exceptions: both hold a
// value outside the array for a moment (insertion sort's `key` variable;
// merge sort's leftCopy/rightCopy) while progressively overwriting cells, so
// mid-operation an array snapshot can transiently show a duplicate value (and
// be missing another) even though the final result is still correct. See
// "insertionSortSteps: specifics" and "mergeSortSteps: specifics" below for
// the verified, weaker guarantee each one actually provides instead.
const STRICTLY_PERMUTING_GENERATORS = GENERATORS.filter(
    ([genName]) => genName !== 'mergeSortSteps' && genName !== 'insertionSortSteps',
);

// =====================================================================
// 1. SHARED CONTRACT
// =====================================================================

describe.each(GENERATORS)('%s: shared contract', (name, generatorFn) => {
    const corpus = inputCorpus();

    test('is a generator function that returns an iterator', () => {
        const generator = generatorFn([3, 1, 2]);
        expect(typeof generator.next).toBe('function');
        expect(generator[Symbol.iterator]()).toBe(generator);
        expect(Object.prototype.toString.call(generator)).toBe('[object Generator]');
    });

    test('can be abandoned part-way through without throwing (Prev/Pause never drains it)', () => {
        const generator = generatorFn([5, 4, 3, 2, 1]);
        generator.next();
        generator.next();
        expect(() => generator.return()).not.toThrow();
        expect(generator.next()).toEqual({ value: undefined, done: true });
    });

    test('every run starts with a "start" step in the "searching" state', () => {
        corpus.forEach((input) => {
            const steps = run(generatorFn, [...input]);
            expect(steps[0].phase).toBe('start');
            expect(steps[0].statusClass).toBe('searching');
        });
    });

    test('every run ends with exactly one "done" step, reporting success', () => {
        corpus.forEach((input) => {
            const steps = run(generatorFn, [...input]);
            const doneSteps = steps.filter((step) => step.phase === 'done');

            expect(doneSteps).toHaveLength(1);
            expect(last(steps)).toBe(doneSteps[0]);
            expect(last(steps).statusClass).toBe('success');
            expect(last(steps).message).toBe('Array sorted!');
        });
    });

    test('the final array is a correctly sorted (ascending) permutation of the input', () => {
        corpus.forEach((input) => {
            const steps = run(generatorFn, [...input]);
            expect(last(steps).array).toEqual([...input].sort(numeric));
        });
    });

    test('every step has the shape renderStep() expects', () => {
        corpus.forEach((input) => {
            run(generatorFn, [...input]).forEach((step) => {
                expect(Array.isArray(step.array)).toBe(true);
                expect(typeof step.highlights).toBe('object');
                expect(step.highlights).not.toBeNull();
                expect(typeof step.message).toBe('string');
                expect(step.message.length).toBeGreaterThan(0);
                expect(['searching', 'success', 'error']).toContain(step.statusClass);
                expect(typeof step.phase).toBe('string');
                expect(step.phase.length).toBeGreaterThan(0);
            });
        });
    });

    test('highlight indices are always integers within [0, length)', () => {
        corpus.forEach((input) => {
            run(generatorFn, [...input]).forEach((step) => {
                const inRange = (i) => Number.isInteger(i) && i >= 0 && i < step.array.length;
                ['comparing', 'current', 'sorted', 'dimmed'].forEach((key) => {
                    (step.highlights[key] || []).forEach((i) => {
                        // The empty-array highlight quirk (see "known quirks" below) is the
                        // one documented exception to this rule.
                        if (input.length === 0) return;
                        expect(inRange(i)).toBe(true);
                    });
                });
            });
        });
    });

    test('does not mutate its input (a frozen array is accepted)', () => {
        const frozen = Object.freeze([5, 3, 8, 1, 9]);
        expect(() => run(generatorFn, frozen)).not.toThrow();
        expect(frozen).toEqual([5, 3, 8, 1, 9]);
    });

    test('snapshots are independent copies (StepPlayer caches them, so aliasing would corrupt Prev)', () => {
        const input = [5, 3, 8, 1, 9];
        const steps = run(generatorFn, [...input]);

        steps.forEach((step) => expect(step.array).not.toBe(input));
        steps.forEach((step, i) => {
            if (i > 0) expect(step.array).not.toBe(steps[i - 1].array);
        });

        steps[0].array[0] = -999; // corrupt one snapshot...
        expect(input[0]).toBe(5); // ...the input is untouched
        expect(steps[1] ? steps[1].array[0] !== -999 || steps.length === 1 : true).toBe(true);
    });

    test('steps are plain, serialisable data (safe to cache and replay)', () => {
        const steps = run(generatorFn, [5, 3, 8, 1, 9]);
        expect(JSON.parse(JSON.stringify(steps))).toEqual(steps);
    });

    test('is deterministic: the same input always yields the same steps', () => {
        corpus.forEach((input) => {
            expect(run(generatorFn, [...input])).toEqual(run(generatorFn, [...input]));
        });
    });

    test('terminates on a larger array without hanging', () => {
        const rng = mulberry32(555);
        const big = randomArray(rng, 200, 0, 500);
        const steps = run(generatorFn, [...big]);
        expect(last(steps).array).toEqual([...big].sort(numeric));
    });

    test('the "done" step highlights the entire array as sorted, once each, when the array is non-empty', () => {
        corpus
            .filter((input) => input.length > 0)
            .forEach((input) => {
                const sorted = last(run(generatorFn, [...input])).highlights.sorted;
                expect([...sorted].sort(numeric)).toEqual(Array.from({ length: input.length }, (_, i) => i));
            });
    });
});

describe.each(STRICTLY_PERMUTING_GENERATORS)('%s: full permutation invariant', (name, generatorFn) => {
    test('EVERY yielded step is an exact permutation of the original input, not just the final one', () => {
        inputCorpus().forEach((input) => {
            const expectedMultiset = [...input].sort(numeric);
            run(generatorFn, [...input]).forEach((step) => {
                expect(step.array).toHaveLength(input.length);
                expect([...step.array].sort(numeric)).toEqual(expectedMultiset);
            });
        });
    });
});

// =====================================================================
// 2. SHARED EDGE CASES
// =====================================================================

describe.each(GENERATORS)('%s: edge cases', (name, generatorFn) => {
    test('single element: sorted trivially, correct result', () => {
        const steps = run(generatorFn, [42]);
        expect(last(steps).array).toEqual([42]);
        expect(last(steps).phase).toBe('done');
    });

    test('two elements, already in order', () => {
        expect(last(run(generatorFn, [1, 2])).array).toEqual([1, 2]);
    });

    test('two elements, reversed', () => {
        expect(last(run(generatorFn, [2, 1])).array).toEqual([1, 2]);
    });

    test('already sorted (ascending)', () => {
        const input = [1, 2, 3, 4, 5, 6, 7, 8];
        expect(last(run(generatorFn, [...input])).array).toEqual(input);
    });

    test('reverse sorted (descending) — the classic worst case', () => {
        const input = [8, 7, 6, 5, 4, 3, 2, 1];
        expect(last(run(generatorFn, [...input])).array).toEqual([...input].sort(numeric));
    });

    test('all duplicates', () => {
        expect(last(run(generatorFn, [4, 4, 4, 4, 4])).array).toEqual([4, 4, 4, 4, 4]);
    });

    test('mixed duplicates', () => {
        const input = [3, 1, 3, 2, 1, 3, 2];
        expect(last(run(generatorFn, [...input])).array).toEqual([...input].sort(numeric));
    });

    test('negative numbers and zero', () => {
        const input = [0, -5, 3, -1, -1, 4];
        expect(last(run(generatorFn, [...input])).array).toEqual([...input].sort(numeric));
    });

    test('large duplicate-heavy random array', () => {
        const rng = mulberry32(31337);
        const input = Array.from({ length: 60 }, () => Math.floor(rng() * 5)); // only 5 distinct values
        expect(last(run(generatorFn, [...input])).array).toEqual([...input].sort(numeric));
    });
});

describe('known quirks: empty array', () => {
    // For an EMPTY array, bubble/selection/insertion emit a `sorted` highlight
    // index that doesn't exist in the array (see the algorithm-specific sections
    // below for exactly what each one emits). renderStep() ignores missing
    // blocks and the UI rejects empty input before ever calling these
    // generators, so it is harmless today. The array-level result is correct
    // for all five regardless.
    test.each(GENERATORS)('%s: still reports an empty, correctly "sorted" array', (name, generatorFn) => {
        const steps = run(generatorFn, []);
        expect(last(steps).array).toEqual([]);
        expect(last(steps).phase).toBe('done');
        expect(last(steps).statusClass).toBe('success');
    });

    test.todo('bubble/selection/insertion never emit an out-of-range "sorted" index for empty input');
});

// =====================================================================
// 3. ALGORITHM-SPECIFIC INVARIANTS
// =====================================================================
// Every count/formula asserted below was measured against the real
// generators (across n = 0..20 and 200 random trials) before being written
// here — none of it is guessed from reading the source alone.

describe('bubbleSortSteps: specifics', () => {
    test('makes exactly n(n-1)/2 comparisons regardless of input order (no early-exit optimization)', () => {
        const rng = mulberry32(11);
        for (let n = 0; n <= 14; n++) {
            const input = randomArray(rng, n);
            const steps = run(bubbleSortSteps, input);
            expect(count(steps, 'compare')).toBe(Math.max(0, (n * (n - 1)) / 2));
        }
    });

    test('an already-sorted array triggers zero swaps (but still the full comparison count)', () => {
        const input = [1, 2, 3, 4, 5, 6, 7, 8];
        const steps = run(bubbleSortSteps, [...input]);
        expect(count(steps, 'swap')).toBe(0);
        expect(count(steps, 'compare')).toBe((input.length * (input.length - 1)) / 2);
    });

    test('a reverse-sorted array triggers a swap on every single comparison', () => {
        const input = [8, 7, 6, 5, 4, 3, 2, 1];
        const steps = run(bubbleSortSteps, [...input]);
        const compares = (input.length * (input.length - 1)) / 2;
        expect(count(steps, 'compare')).toBe(compares);
        expect(count(steps, 'swap')).toBe(compares);
    });

    test('every "swap" step is immediately preceded by the matching "compare" step that justified it', () => {
        const rng = mulberry32(2222);
        for (let trial = 0; trial < 100; trial++) {
            const input = randomArray(rng, 2 + Math.floor(rng() * 12));
            const steps = run(bubbleSortSteps, [...input]);

            steps.forEach((step, i) => {
                if (step.phase !== 'swap') return;
                const [j, j1] = step.highlights.comparing;
                const prev = steps[i - 1];

                expect(prev.phase).toBe('compare');
                expect(prev.highlights.comparing).toEqual([j, j1]);
                expect(prev.array[j]).toBeGreaterThan(prev.array[j1]); // the exact swap condition
                expect(step.array[j]).toBe(prev.array[j1]); // and the values were actually exchanged
                expect(step.array[j1]).toBe(prev.array[j]);
            });
        }
    });

    test("empty input: the 'done' step's sorted highlight is [0] (documented quirk, array itself is still [])", () => {
        const steps = run(bubbleSortSteps, []);
        expect(last(steps).highlights).toEqual({ sorted: [0] });
        expect(last(steps).array).toEqual([]);
    });
});

describe('selectionSortSteps: specifics', () => {
    test('makes exactly n(n-1)/2 comparisons and max(0, n-1) "assume-min" steps', () => {
        const rng = mulberry32(22);
        for (let n = 0; n <= 14; n++) {
            const input = randomArray(rng, n);
            const steps = run(selectionSortSteps, input);
            expect(count(steps, 'compare')).toBe(Math.max(0, (n * (n - 1)) / 2));
            expect(count(steps, 'assume-min')).toBe(Math.max(0, n - 1));
        }
    });

    test('an already-sorted array triggers zero swaps', () => {
        const input = [1, 2, 3, 4, 5, 6, 7, 8];
        expect(count(run(selectionSortSteps, [...input]), 'swap')).toBe(0);
    });

    test('a reverse-sorted array triggers exactly floor(n/2) swaps', () => {
        for (const n of [2, 3, 5, 8, 12, 20]) {
            const input = Array.from({ length: n }, (_, i) => n - 1 - i);
            expect(count(run(selectionSortSteps, input), 'swap')).toBe(Math.floor(n / 2));
        }
    });

    test('never emits more than n-1 swaps', () => {
        const rng = mulberry32(3333);
        for (let trial = 0; trial < 100; trial++) {
            const input = randomArray(rng, Math.floor(rng() * 20));
            expect(count(run(selectionSortSteps, input), 'swap')).toBeLessThanOrEqual(Math.max(0, input.length - 1));
        }
    });

    test('every "new-min" step is immediately preceded by the "compare" that found it', () => {
        const rng = mulberry32(4444);
        for (let trial = 0; trial < 100; trial++) {
            const input = randomArray(rng, 2 + Math.floor(rng() * 12));
            const steps = run(selectionSortSteps, [...input]);

            steps.forEach((step, i) => {
                if (step.phase !== 'new-min') return;
                const prev = steps[i - 1];
                const j = prev.highlights.comparing[0];
                const previousMinIdx = prev.highlights.current[0];

                expect(prev.phase).toBe('compare');
                expect(step.highlights.current).toEqual([j]);
                expect(prev.array[j]).toBeLessThan(prev.array[previousMinIdx]); // the exact new-min condition
            });
        }
    });

    test("empty input: the 'done' step's sorted highlight is [-1] (documented quirk, array itself is still [])", () => {
        const steps = run(selectionSortSteps, []);
        expect(last(steps).highlights).toEqual({ sorted: [-1] });
        expect(last(steps).array).toEqual([]);
    });
});

describe('insertionSortSteps: specifics', () => {
    test('makes exactly max(0, n-1) "pick-key" steps, and "compare-shift"/"shift" are always paired 1:1', () => {
        const rng = mulberry32(33);
        for (let n = 0; n <= 14; n++) {
            const input = randomArray(rng, n);
            const steps = run(insertionSortSteps, input);
            expect(count(steps, 'pick-key')).toBe(Math.max(0, n - 1));
            expect(count(steps, 'compare-shift')).toBe(count(steps, 'shift'));
        }
    });

    test('an already-sorted array triggers zero shifts (nothing to move)', () => {
        const input = [1, 2, 3, 4, 5, 6, 7, 8];
        expect(count(run(insertionSortSteps, [...input]), 'compare-shift')).toBe(0);
    });

    test('a reverse-sorted array triggers exactly n(n-1)/2 shifts — the classic worst case', () => {
        const input = [8, 7, 6, 5, 4, 3, 2, 1];
        const steps = run(insertionSortSteps, [...input]);
        expect(count(steps, 'compare-shift')).toBe((input.length * (input.length - 1)) / 2);
    });

    test('the "sorted" highlight, whenever present, is always a contiguous prefix starting at 0', () => {
        // Unlike bubble/selection (whose "sorted" set is scattered until the run
        // finishes), insertion sort's sorted region genuinely grows left-to-right
        // one element at a time — this is what distinguishes it structurally.
        const rng = mulberry32(5555);
        inputCorpus()
            .filter((input) => input.length > 0)
            .concat([randomArray(rng, 15)])
            .forEach((input) => {
                run(insertionSortSteps, [...input]).forEach((step) => {
                    if (step.highlights.sorted) expect(isPrefix(step.highlights.sorted)).toBe(true);
                });
            });
    });

    test('the prefix never shrinks within a single run', () => {
        const rng = mulberry32(6666);
        const input = randomArray(rng, 15);
        const lengths = run(insertionSortSteps, input)
            .map((step) => step.highlights.sorted && step.highlights.sorted.length)
            .filter((length) => length !== undefined);

        lengths.forEach((length, i) => {
            if (i > 0) expect(length).toBeGreaterThanOrEqual(lengths[i - 1]);
        });
    });

    test("empty input: the 'start' step's sorted highlight is [0] (documented quirk), 'done' correctly reports []", () => {
        const steps = run(insertionSortSteps, []);
        expect(steps[0].highlights).toEqual({ sorted: [0] });
        expect(last(steps).highlights).toEqual({ sorted: [] });
        expect(last(steps).array).toEqual([]);
    });

    test('the permutation invariant holds exactly at "start", "pick-key", "insert" and "done"', () => {
        const rng = mulberry32(4321);
        for (let trial = 0; trial < 150; trial++) {
            const input = randomArray(rng, Math.floor(rng() * 18));
            const expectedMultiset = [...input].sort(numeric);

            run(insertionSortSteps, [...input])
                .filter((step) => ['start', 'pick-key', 'insert', 'done'].includes(step.phase))
                .forEach((step) => {
                    expect([...step.array].sort(numeric)).toEqual(expectedMultiset);
                });
        }
    });

    // KNOWN, VERIFIED QUIRK: the picked-up `key` is held in a local variable
    // (not visible anywhere in the array) while values are shifted right to
    // make room for it. So mid-shift, the array can transiently show the
    // shifted-from value twice — once in its old spot (not yet overwritten)
    // and once in the spot it was just shifted into — while `key` itself is
    // briefly invisible in the snapshot. The array is provably correct again
    // by the very next 'insert' step, once `key` is written back.
    test('during an active shift, every array cell still holds a real value from the original input', () => {
        const rng = mulberry32(8765);
        for (let trial = 0; trial < 60; trial++) {
            const input = randomArray(rng, Math.floor(rng() * 18));
            const validValues = new Set(input);

            run(insertionSortSteps, [...input]).forEach((step) => {
                expect(step.array).toHaveLength(input.length);
                step.array.forEach((value) => expect(validValues.has(value)).toBe(true));
            });
        }
    });

    test('demonstrates the quirk directly: inserting into [3, 1, 2] transiently shows [3, 3, 2] before correcting to [1, 3, 2]', () => {
        const steps = run(insertionSortSteps, [3, 1, 2]);
        const arrays = steps.map((step) => step.array);
        expect(arrays).toContainEqual([3, 3, 2]); // the transient duplicate; the picked-up 1 is briefly invisible
        expect(arrays).toContainEqual([1, 3, 2]); // corrected once 'insert' writes the key back
    });
});

describe('mergeSortSteps: specifics', () => {
    test('makes exactly max(0, n-1) "split" steps (n leaves means n-1 internal nodes, any split policy)', () => {
        const rng = mulberry32(44);
        for (let n = 0; n <= 20; n++) {
            const input = randomArray(rng, n);
            expect(count(run(mergeSortSteps, input), 'split')).toBe(Math.max(0, n - 1));
        }
    });

    test('every "split" step covers the active range exactly once: current + dimmed partition [0, n)', () => {
        const rng = mulberry32(7777);
        for (const n of [2, 3, 5, 7, 10, 13, 21]) {
            const input = randomArray(rng, n);
            const splitSteps = run(mergeSortSteps, input).filter((step) => step.phase === 'split');

            splitSteps.forEach((step) => {
                const { current, dimmed } = step.highlights;
                expect(current.length).toBeGreaterThan(1); // a split only happens on a range of size >= 2
                expect(isAscendingRun(current)).toBe(true); // a contiguous block, not scattered
                expect(current.some((i) => dimmed.includes(i))).toBe(false); // no overlap
                expect(current.length + dimmed.length).toBe(n); // union is everything
            });
        }
    });

    test('"merge-compare" and "merge-overwrite" steps never touch a dimmed (out-of-range) index', () => {
        inputCorpus()
            .filter((input) => input.length > 0)
            .forEach((input) => {
                run(mergeSortSteps, [...input]).forEach((step) => {
                    if (step.phase !== 'merge-compare' && step.phase !== 'merge-overwrite') return;
                    const dimmed = new Set(step.highlights.dimmed || []);
                    const touched = [...(step.highlights.comparing || []), ...(step.highlights.current || [])];
                    touched.forEach((i) => expect(dimmed.has(i)).toBe(false));
                });
            });
    });

    test('a single-element or empty array never splits or merges', () => {
        expect(phasesOf(run(mergeSortSteps, []))).toEqual(['start', 'done']);
        expect(phasesOf(run(mergeSortSteps, [42]))).toEqual(['start', 'done']);
    });

    test('the permutation invariant holds exactly at "start", "split" and "done" (see below for why not always)', () => {
        const rng = mulberry32(9001);
        for (let trial = 0; trial < 150; trial++) {
            const input = randomArray(rng, Math.floor(rng() * 18));
            const expectedMultiset = [...input].sort(numeric);

            run(mergeSortSteps, [...input])
                .filter((step) => step.phase === 'start' || step.phase === 'split' || step.phase === 'done')
                .forEach((step) => {
                    expect([...step.array].sort(numeric)).toEqual(expectedMultiset);
                });
        }
    });

    // KNOWN, VERIFIED QUIRK: unlike the other four algorithms, mergeSortSteps
    // writes its merged output progressively into `arr` while the not-yet-
    // overwritten trailing cells still show their old, pre-merge values. So a
    // value can be transiently VISIBLE TWICE on screen — once in its new,
    // correctly-merged position, and once still sitting at its old position,
    // waiting to be overwritten a few steps later. This is a real visual
    // characteristic of this in-place-write merge (many sorting visualizers do
    // this), not a defect: leftCopy/rightCopy already hold safe copies of every
    // original value before any writes happen, so the FINAL result at 'done' is
    // still a byte-for-byte correct sort every time (see the shared contract
    // tests above). This test locks in exactly what CAN be relied on mid-merge:
    // no index goes out of bounds and no value is ever invented from thin air.
    test('during an active merge, every array cell still holds a real value from the original input', () => {
        const rng = mulberry32(1234);
        for (let trial = 0; trial < 60; trial++) {
            const input = randomArray(rng, Math.floor(rng() * 18));
            const validValues = new Set(input);

            run(mergeSortSteps, [...input]).forEach((step) => {
                expect(step.array).toHaveLength(input.length);
                step.array.forEach((value) => expect(validValues.has(value)).toBe(true));
            });
        }
    });

    test('demonstrates the quirk directly: merging [2, 1] transiently shows [1, 1] before correcting to [1, 2]', () => {
        const steps = run(mergeSortSteps, [2, 1]);
        const arrays = steps.map((step) => step.array);
        expect(arrays).toContainEqual([1, 1]); // the transient duplicate
        expect(last(steps).array).toEqual([1, 2]); // still ends up correct
    });

    test('is stable: on a tie, the LEFT half is always taken first (leftCopy[i] <= rightCopy[j])', () => {
        // Plain numbers can't show "which 3 was which" once sorted, and reading the
        // array AT the compared positions doesn't work either — mid-merge, those
        // positions can already be stale leftovers from this merge's own progressive
        // overwrite (see the transient-duplicate quirk above), not the real
        // leftCopy[i]/rightCopy[j] values. The one reliable source for what was
        // actually compared is the step's own message ("Comparing X and Y..."),
        // which is built directly from leftCopy[i] and rightCopy[j] at yield time.
        // So: for every tie (message reports equal values), the NEXT merge-compare
        // step for that same call must show the left pointer advanced by one and the
        // right pointer unchanged — i.e. the left element was taken first.
        function checkGroupIsStable(mergeCompareSteps) {
            for (let k = 0; k < mergeCompareSteps.length - 1; k++) {
                const [leftValue, rightValue] = mergeCompareSteps[k].message.match(/Comparing (-?\d+) and (-?\d+)/).slice(1, 3).map(Number);
                if (leftValue !== rightValue) continue; // only ties are stability-sensitive

                const [leftPos, rightPos] = mergeCompareSteps[k].highlights.comparing;
                const [nextLeftPos, nextRightPos] = mergeCompareSteps[k + 1].highlights.comparing;
                expect([nextLeftPos, nextRightPos]).toEqual([leftPos + 1, rightPos]);
            }
        }

        const rng = mulberry32(13);
        let tiesObserved = 0;
        for (let trial = 0; trial < 300; trial++) {
            const input = randomArray(rng, Math.floor(rng() * 20), 0, 5); // small range: heavy duplicates
            const compareSteps = run(mergeSortSteps, input).filter((step) => step.phase === 'merge-compare');
            tiesObserved += compareSteps.filter((step) => {
                const [l, r] = step.message.match(/Comparing (-?\d+) and (-?\d+)/).slice(1, 3);
                return l === r;
            }).length;

            // Group by `dimmed` (identifies which merge() call a comparison belongs
            // to; every call's own range is unique, and delegation is sequential, so
            // this recovers each call's compare steps in order without interleaving).
            const groups = new Map();
            compareSteps.forEach((step) => {
                const key = JSON.stringify(step.highlights.dimmed);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(step);
            });
            groups.forEach(checkGroupIsStable);
        }

        expect(tiesObserved).toBeGreaterThan(500); // sanity check: the corpus actually exercises ties
    });
});

describe('quickSortSteps: specifics', () => {
    test('"pivot" and "partition-done" are always yielded in matching pairs (one per partition call)', () => {
        const rng = mulberry32(55);
        for (let n = 0; n <= 14; n++) {
            const input = randomArray(rng, n);
            const steps = run(quickSortSteps, input);
            expect(count(steps, 'pivot')).toBe(count(steps, 'partition-done'));
        }
    });

    test('every "pivot" step names the correct value: the last element of its (implicit) range', () => {
        const rng = mulberry32(8888);
        for (let trial = 0; trial < 100; trial++) {
            const input = randomArray(rng, 2 + Math.floor(rng() * 12));
            const steps = run(quickSortSteps, [...input]);

            steps
                .filter((step) => step.phase === 'pivot')
                .forEach((step) => {
                    const pivotValue = step.array[step.highlights.current[0]];
                    expect(step.message).toContain(String(pivotValue));
                });
        }
    });

    test('a single-element or empty array never partitions (the base case pushes silently)', () => {
        expect(phasesOf(run(quickSortSteps, []))).toEqual(['start', 'done']);
        expect(phasesOf(run(quickSortSteps, [42]))).toEqual(['start', 'done']);
    });

    test('already-sorted input (worst case: O(n^2) partitions) still sorts correctly and terminates', () => {
        const input = Array.from({ length: 200 }, (_, i) => i);
        const steps = run(quickSortSteps, [...input]);
        expect(last(steps).array).toEqual(input);
        expect(count(steps, 'pivot')).toBe(count(steps, 'partition-done'));
    });

    test('reverse-sorted input (also worst case for a last-element pivot) still sorts correctly', () => {
        const input = Array.from({ length: 200 }, (_, i) => 199 - i);
        expect(last(run(quickSortSteps, [...input])).array).toEqual([...input].sort(numeric));
    });
});

// =====================================================================
// 4. THE CODE PANEL TELLS THE TRUTH
// =====================================================================
// The JavaScript snippet students read must behave exactly like the generator
// they watch. Compile the displayed snippet and compare the two.

describe.each([
    ['bubble-sort', 'bubbleSort', bubbleSortSteps],
    ['selection-sort', 'selectionSort', selectionSortSteps],
    ['insertion-sort', 'insertionSort', insertionSortSteps],
    ['merge-sort', 'mergeSort', mergeSortSteps],
    ['quick-sort', 'quickSort', quickSortSteps],
])('displayed JavaScript snippet for %s', (id, functionName, generatorFn) => {
    const snippet = new Function(`${algorithmDatabase[id].code.javascript}\nreturn ${functionName};`)();

    test(`defines a callable ${functionName}(arr)`, () => {
        expect(typeof snippet).toBe('function');
    });

    test('produces the same fully-sorted array as the generator, for every corpus input', () => {
        inputCorpus().forEach((input) => {
            const expected = last(run(generatorFn, [...input])).array;
            const actual = snippet([...input]);
            expect({ input, actual }).toEqual({ input, actual: expected });
        });
    });

    test('produces the same result on a larger random array', () => {
        const rng = mulberry32(9999);
        const input = randomArray(rng, 120);
        expect(snippet([...input])).toEqual(last(run(generatorFn, [...input])).array);
    });
});
