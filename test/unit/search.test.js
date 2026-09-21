// ==========================================
// SEARCH GENERATOR TESTS (tests/unit/search.test.js)
// ==========================================
// Covers linearSearchSteps and binarySearchSteps from js/algorithms/search.js.
//
// The generators are pure (no DOM, no timers), so these run in the default
// `node` Jest environment. Three layers:
//   1. a CONTRACT shared by both generators (step shape, immutability, termination)
//   2. LINEAR SEARCH specifics (exact step sequences, first-occurrence, edge cases)
//   3. BINARY SEARCH specifics (window invariants, log2 bound, exhaustive checks)
// plus a check that the JavaScript snippet shown in the code panel really does
// what the generator animates.

import { linearSearchSteps, binarySearchSteps } from '../../js/algorithms/search.js';
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
    const limit = 10000;
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

// The step (if any) that reports where the target was found.
const foundIndexOf = (steps) => {
    const terminal = last(steps);
    return terminal.phase === 'found' ? terminal.highlights.found : -1;
};

// Inputs shared by the contract tests: empty, single, tiny, duplicates, negatives, zero, random.
function inputCorpus() {
    const rng = mulberry32(99);
    return [
        [],
        [5],
        [1, 2],
        [2, 1],
        [4, 4, 4],
        [0, -3, 7],
        [3, 0, 5],
        [9, 3, 7, 3, 1, 8, 2],
        randomArray(rng, 10),
        randomArray(rng, 17),
    ];
}

// Targets that hit every position plus misses below / between / above the data.
function targetsFor(arr) {
    if (arr.length === 0) return [0, 1];
    const distinct = [...new Set(arr)];
    return [...distinct, Math.min(...arr) - 1, Math.max(...arr) + 1, 1000];
}

const GENERATORS = [
    ['linearSearchSteps', linearSearchSteps, (arr) => arr],
    ['binarySearchSteps', binarySearchSteps, (arr) => [...arr].sort(numeric)], // binary search needs sorted input
];

// =====================================================================
// 1. SHARED CONTRACT
// =====================================================================

describe.each(GENERATORS)('%s: shared contract', (name, generatorFn, prepare) => {
    // Every (array, target) pair from the corpus, prepared the way the UI prepares it.
    const cases = inputCorpus().flatMap((raw) => {
        const arr = prepare(raw);
        return targetsFor(arr).map((target) => ({ arr, target }));
    });

    test('is a generator function that returns an iterator', () => {
        const generator = generatorFn([1, 2, 3], 2);
        expect(typeof generator.next).toBe('function');
        expect(generator[Symbol.iterator]()).toBe(generator);
        expect(Object.prototype.toString.call(generator)).toBe('[object Generator]');
    });

    test('can be abandoned part-way through without throwing (Prev/Pause never drains it)', () => {
        const generator = generatorFn([1, 2, 3, 4, 5], 5);
        generator.next();
        generator.next();
        expect(() => generator.return()).not.toThrow();
        expect(generator.next()).toEqual({ value: undefined, done: true });
    });

    test('every run starts with a "start" step in the "searching" state', () => {
        cases.forEach(({ arr, target }) => {
            const steps = run(generatorFn, arr, target);
            expect(steps[0].phase).toBe('start');
            expect(steps[0].statusClass).toBe('searching');
            expect(steps[0].message).toContain(String(target));
        });
    });

    test('every run ends with exactly one terminal step: found (success) or not-found (error)', () => {
        cases.forEach(({ arr, target }) => {
            const steps = run(generatorFn, arr, target);
            const terminals = steps.filter((step) => step.phase === 'found' || step.phase === 'not-found');

            expect(terminals).toHaveLength(1);
            expect(last(steps)).toBe(terminals[0]);
            expect(last(steps).statusClass).toBe(last(steps).phase === 'found' ? 'success' : 'error');
        });
    });

    test('reports "found" if and only if the target is in the array', () => {
        cases.forEach(({ arr, target }) => {
            const steps = run(generatorFn, arr, target);
            expect(last(steps).phase).toBe(arr.includes(target) ? 'found' : 'not-found');
        });
    });

    test('the reported index really holds the target; a miss reports no index', () => {
        cases.forEach(({ arr, target }) => {
            const steps = run(generatorFn, arr, target);
            const terminal = last(steps);

            if (terminal.phase === 'found') {
                expect(Number.isInteger(terminal.highlights.found)).toBe(true);
                expect(arr[terminal.highlights.found]).toBe(target);
            } else {
                expect(terminal.highlights.found).toBeUndefined();
            }
        });
    });

    test('every step has the shape renderStep() expects', () => {
        cases.forEach(({ arr, target }) => {
            run(generatorFn, arr, target).forEach((step) => {
                expect(Array.isArray(step.array)).toBe(true);
                expect(typeof step.highlights).toBe('object');
                expect(step.highlights).not.toBeNull();
                expect(typeof step.message).toBe('string');
                expect(step.message.length).toBeGreaterThan(0);
                expect(['searching', 'success', 'error']).toContain(step.statusClass);
                expect(typeof step.phase).toBe('string');
            });
        });
    });

    test('search never changes the array: every snapshot equals the input', () => {
        cases.forEach(({ arr, target }) => {
            run(generatorFn, arr, target).forEach((step) => {
                expect(step.array).toEqual(arr);
            });
        });
    });

    test('does not mutate its input (a frozen array is accepted)', () => {
        const frozen = Object.freeze([5, 3, 8, 1, 9].sort(numeric));
        expect(() => run(generatorFn, frozen, 8)).not.toThrow();
        expect(frozen).toEqual([1, 3, 5, 8, 9]);
    });

    test('snapshots are independent copies (StepPlayer caches them, so aliasing would corrupt Prev)', () => {
        const input = [1, 3, 5, 7, 9];
        const steps = run(generatorFn, input, 7);

        steps.forEach((step) => expect(step.array).not.toBe(input));
        steps.forEach((step, i) => {
            if (i > 0) expect(step.array).not.toBe(steps[i - 1].array);
        });

        steps[0].array[0] = 999; // corrupt one snapshot...
        expect(input[0]).toBe(1); // ...the input is untouched
        expect(steps[1].array[0]).toBe(1); // ...and so is every other snapshot
    });

    test('steps are plain, serialisable data (safe to cache and replay)', () => {
        const steps = run(generatorFn, [1, 3, 5, 7, 9], 4);
        expect(JSON.parse(JSON.stringify(steps))).toEqual(steps);
    });

    test('is deterministic: the same input always yields the same steps', () => {
        cases.forEach(({ arr, target }) => {
            expect(run(generatorFn, arr, target)).toEqual(run(generatorFn, arr, target));
        });
    });

    test('terminates, even for a large array', () => {
        const big = Array.from({ length: 1000 }, (_, i) => i * 2);
        expect(() => run(generatorFn, big, 1998)).not.toThrow(); // last element
        expect(() => run(generatorFn, big, 1)).not.toThrow(); // absent
    });

    test('finds zero and negative numbers (0 is falsy, so a truthiness bug would hide here)', () => {
        const arr = prepare([3, 0, -4, 5]);
        expect(last(run(generatorFn, arr, 0)).phase).toBe('found');
        expect(last(run(generatorFn, arr, -4)).phase).toBe('found');
        expect(arr[foundIndexOf(run(generatorFn, arr, 0))]).toBe(0);
    });

    test('uses strict equality: the string "5" is not the number 5', () => {
        expect(last(run(generatorFn, [1, 5, 9], '5')).phase).toBe('not-found');
    });
});

// =====================================================================
// 2. LINEAR SEARCH
// =====================================================================

describe('linearSearchSteps', () => {
    describe.each([
        // [description, array, target, expected phases, expected found index]
        ['empty array', [], 5, ['start', 'not-found'], -1],
        ['single element: hit', [5], 5, ['start', 'checking', 'found'], 0],
        ['single element: miss', [5], 9, ['start', 'checking', 'not-found'], -1],
        ['target is the first element', [4, 1, 2], 4, ['start', 'checking', 'found'], 0],
        ['target is the last element', [1, 2, 3], 3, ['start', 'checking', 'checking', 'checking', 'found'], 2],
        ['target in the middle', [8, 6, 7, 5], 7, ['start', 'checking', 'checking', 'checking', 'found'], 2],
        ['target absent', [1, 2, 3], 9, ['start', 'checking', 'checking', 'checking', 'not-found'], -1],
        ['duplicates: stops at the FIRST match', [1, 7, 7, 7], 7, ['start', 'checking', 'checking', 'found'], 1],
        ['zero as target', [3, 0, 5], 0, ['start', 'checking', 'checking', 'found'], 1],
        ['negative target', [3, -2, 5], -2, ['start', 'checking', 'checking', 'found'], 1],
        ['unsorted input is fine', [9, 1, 8, 2], 2, ['start', 'checking', 'checking', 'checking', 'checking', 'found'], 3],
    ])('%s', (description, arr, target, expectedPhases, expectedIndex) => {
        const steps = run(linearSearchSteps, arr, target);

        test('yields exactly the expected phase sequence', () => {
            expect(phasesOf(steps)).toEqual(expectedPhases);
        });

        test('reports the expected index', () => {
            expect(foundIndexOf(steps)).toBe(expectedIndex);
        });
    });

    test('examines indices 0, 1, 2, ... in order, one "current" highlight per step', () => {
        const steps = run(linearSearchSteps, [5, 6, 7, 8, 9], 99);
        const checked = steps.filter((step) => step.phase === 'checking').map((step) => step.highlights.current);

        expect(checked).toEqual([[0], [1], [2], [3], [4]]);
    });

    test('a hit at index i takes exactly i + 1 checks; a miss takes exactly n checks', () => {
        inputCorpus().forEach((arr) => {
            targetsFor(arr).forEach((target) => {
                const steps = run(linearSearchSteps, arr, target);
                const expectedChecks = arr.includes(target) ? arr.indexOf(target) + 1 : arr.length;
                expect(count(steps, 'checking')).toBe(expectedChecks);
            });
        });
    });

    test('always returns the first occurrence (matches Array.prototype.indexOf)', () => {
        inputCorpus().forEach((arr) => {
            targetsFor(arr).forEach((target) => {
                expect(foundIndexOf(run(linearSearchSteps, arr, target))).toBe(arr.indexOf(target));
            });
        });
    });

    test('total steps are start + checks + terminal (worst case n + 2)', () => {
        const arr = randomArray(mulberry32(7), 25, 0, 100);
        const steps = run(linearSearchSteps, arr, 12345);
        expect(steps).toHaveLength(arr.length + 2);
    });

    test('the "found" step highlights only the found index and no other state', () => {
        const terminal = last(run(linearSearchSteps, [4, 5, 6], 5));
        expect(terminal.highlights).toEqual({ found: 1 });
    });

    test('checking messages name the index and value being compared; the found message names index and target', () => {
        const steps = run(linearSearchSteps, [10, 20, 30], 30);
        const checking = steps.filter((step) => step.phase === 'checking');

        checking.forEach((step, i) => {
            expect(step.message).toContain(`[${i}]`);
            expect(step.message).toContain(String([10, 20, 30][i]));
        });
        expect(last(steps).message).toContain('30');
        expect(last(steps).message).toContain('[2]');
    });
});

// =====================================================================
// 3. BINARY SEARCH
// =====================================================================

// Recovers the active [left, right] window of a 'checking' step from its
// `dimmed` highlight (dimmed = everything OUTSIDE the window).
function windowOf(checkingStep) {
    const length = checkingStep.array.length;
    const dimmed = new Set(checkingStep.highlights.dimmed || []);
    const live = [];
    for (let i = 0; i < length; i++) if (!dimmed.has(i)) live.push(i);
    return { left: live[0], right: live[live.length - 1], size: live.length, live };
}

// A sorted array of `n` distinct values with gaps (0, 3, 6, ...), so there are
// always "between" values that are definitely absent.
const spacedArray = (n) => Array.from({ length: n }, (_, i) => i * 3);

describe('binarySearchSteps', () => {
    describe.each([
        // [description, array, target, expected phases, expected found index]
        ['empty array', [], 5, ['start', 'not-found'], -1],
        ['single element: hit', [5], 5, ['start', 'checking', 'found'], 0],
        ['single element: miss (too small)', [5], 1, ['start', 'checking', 'discard-right', 'not-found'], -1],
        ['single element: miss (too big)', [5], 9, ['start', 'checking', 'discard-left', 'not-found'], -1],
        ['hit on the first probe (odd length)', [1, 3, 5, 7, 9], 5, ['start', 'checking', 'found'], 2],
        ['target is the first element', [1, 3, 5, 7, 9], 1, ['start', 'checking', 'discard-right', 'checking', 'found'], 0],
        ['target is the last element', [1, 3, 5, 7, 9], 9, ['start', 'checking', 'discard-left', 'checking', 'discard-left', 'checking', 'found'], 4],
        ['two elements: lower', [2, 8], 2, ['start', 'checking', 'found'], 0],
        ['two elements: upper', [2, 8], 8, ['start', 'checking', 'discard-left', 'checking', 'found'], 1],
        ['absent, below the range', [10, 20, 30], 1, ['start', 'checking', 'discard-right', 'checking', 'discard-right', 'not-found'], -1],
        ['absent, above the range', [10, 20, 30], 99, ['start', 'checking', 'discard-left', 'checking', 'discard-left', 'not-found'], -1],
    ])('%s', (description, arr, target, expectedPhases, expectedIndex) => {
        const steps = run(binarySearchSteps, arr, target);

        test('yields exactly the expected phase sequence', () => {
            expect(phasesOf(steps)).toEqual(expectedPhases);
        });

        test('reports the expected index', () => {
            expect(foundIndexOf(steps)).toBe(expectedIndex);
        });
    });

    test('phase order is always: start, (checking, discard)*, then a final checking+found or not-found', () => {
        inputCorpus().forEach((raw) => {
            const arr = [...raw].sort(numeric);
            targetsFor(arr).forEach((target) => {
                const sequence = phasesOf(run(binarySearchSteps, arr, target)).join(' ');
                expect(sequence).toMatch(/^start( checking discard-(left|right))*( checking found| not-found)$/);
            });
        });
    });

    test('exhaustive: for every length 0..32, every element is found at its own index', () => {
        for (let n = 0; n <= 32; n++) {
            const arr = spacedArray(n);
            arr.forEach((value, index) => {
                const steps = run(binarySearchSteps, arr, value);
                expect({ n, value, index: foundIndexOf(steps) }).toEqual({ n, value, index });
            });
        }
    });

    test('exhaustive: for every length 0..32, every absent value (below / between / above) is not found', () => {
        for (let n = 0; n <= 32; n++) {
            const arr = spacedArray(n);
            const absent = [-1, ...arr.map((value) => value + 1), ...arr.map((value) => value + 2)];
            absent.forEach((target) => {
                const steps = run(binarySearchSteps, arr, target);
                expect({ n, target, phase: last(steps).phase }).toEqual({ n, target, phase: 'not-found' });
            });
        }
    });

    test('never makes more than floor(log2 n) + 1 comparisons (the whole point of binary search)', () => {
        for (let n = 1; n <= 200; n++) {
            const arr = spacedArray(n);
            const bound = Math.floor(Math.log2(n)) + 1;
            const targets = [...arr, -1, arr[n - 1] + 1, arr[Math.floor(n / 2)] + 1];

            targets.forEach((target) => {
                const checks = count(run(binarySearchSteps, arr, target), 'checking');
                expect({ n, target, withinBound: checks <= bound }).toEqual({ n, target, withinBound: true });
            });
        }
    });

    test('a 1000-element array needs at most 10 comparisons', () => {
        const arr = Array.from({ length: 1000 }, (_, i) => i);
        [0, 1, 499, 500, 998, 999, -5, 5000].forEach((target) => {
            expect(count(run(binarySearchSteps, arr, target), 'checking')).toBeLessThanOrEqual(10);
        });
    });

    describe('window invariants (checked on every step of every run)', () => {
        const arr = spacedArray(21);
        const targets = [...arr, -1, 1, 31, 62, 1000];

        test('each probe is the midpoint of the active window: mid = floor((left + right) / 2)', () => {
            targets.forEach((target) => {
                run(binarySearchSteps, arr, target)
                    .filter((step) => step.phase === 'checking')
                    .forEach((step) => {
                        const { left, right } = windowOf(step);
                        expect(step.highlights.current).toEqual([Math.floor((left + right) / 2)]);
                    });
            });
        });

        test('the active window is always a contiguous, non-empty range and the probe lies inside it', () => {
            targets.forEach((target) => {
                run(binarySearchSteps, arr, target)
                    .filter((step) => step.phase === 'checking')
                    .forEach((step) => {
                        const { left, right, size, live } = windowOf(step);
                        expect(size).toBeGreaterThan(0);
                        expect(live).toEqual(Array.from({ length: right - left + 1 }, (_, i) => left + i));
                        expect(step.highlights.dimmed).not.toContain(step.highlights.current[0]);
                    });
            });
        });

        test('the window strictly shrinks on every iteration', () => {
            targets.forEach((target) => {
                const sizes = run(binarySearchSteps, arr, target)
                    .filter((step) => step.phase === 'checking')
                    .map((step) => windowOf(step).size);

                sizes.forEach((size, i) => {
                    if (i > 0) expect(size).toBeLessThan(sizes[i - 1]);
                });
            });
        });

        test('discard-left / discard-right are chosen by comparing the probe with the target', () => {
            targets.forEach((target) => {
                const steps = run(binarySearchSteps, arr, target);

                steps.forEach((step, i) => {
                    if (step.phase !== 'discard-left' && step.phase !== 'discard-right') return;
                    const mid = steps[i - 1].highlights.current[0];

                    if (step.phase === 'discard-left') expect(arr[mid]).toBeLessThan(target);
                    else expect(arr[mid]).toBeGreaterThan(target);
                    expect(step.highlights.dimmed).toContain(mid); // the probed element is ruled out
                });
            });
        });

        test('the next window is exactly the discarded half removed: left = mid + 1 or right = mid - 1', () => {
            targets.forEach((target) => {
                const checks = run(binarySearchSteps, arr, target).filter((step) => step.phase === 'checking');

                checks.forEach((step, i) => {
                    if (i === 0) return;
                    const prev = windowOf(checks[i - 1]);
                    const prevMid = checks[i - 1].highlights.current[0];
                    const now = windowOf(step);

                    if (arr[prevMid] < target) {
                        expect(now).toMatchObject({ left: prevMid + 1, right: prev.right });
                    } else {
                        expect(now).toMatchObject({ left: prev.left, right: prevMid - 1 });
                    }
                });
            });
        });

        test('the first probe covers the whole array', () => {
            const first = run(binarySearchSteps, arr, 30).find((step) => step.phase === 'checking');
            expect(windowOf(first)).toMatchObject({ left: 0, right: arr.length - 1, size: arr.length });
            expect(first.highlights.dimmed).toEqual([]);
        });

        test('a "found" step points at the element that was just probed', () => {
            targets.forEach((target) => {
                const steps = run(binarySearchSteps, arr, target);
                if (last(steps).phase !== 'found') return;
                const probe = steps[steps.length - 2];

                expect(probe.phase).toBe('checking');
                expect(last(steps).highlights.found).toBe(probe.highlights.current[0]);
            });
        });
    });

    describe('edge cases', () => {
        test('duplicates: returns some index holding the target (not necessarily the first)', () => {
            const arr = [1, 2, 2, 2, 3];
            const steps = run(binarySearchSteps, arr, 2);
            expect(arr[foundIndexOf(steps)]).toBe(2);
            expect(foundIndexOf(steps)).toBe(2); // first probe is the middle: index 2
        });

        test('all-equal array: hit on the first probe, miss after log2 steps', () => {
            const arr = [4, 4, 4, 4, 4, 4, 4];
            expect(count(run(binarySearchSteps, arr, 4), 'checking')).toBe(1);
            expect(count(run(binarySearchSteps, arr, 5), 'checking')).toBeLessThanOrEqual(3);
        });

        test('negative numbers and zero are handled', () => {
            const arr = [-10, -3, 0, 4, 9];
            expect(foundIndexOf(run(binarySearchSteps, arr, -10))).toBe(0);
            expect(foundIndexOf(run(binarySearchSteps, arr, 0))).toBe(2);
            expect(last(run(binarySearchSteps, arr, -4)).phase).toBe('not-found');
        });

        test('agrees with linear search on sorted arrays with duplicates (found iff present)', () => {
            const rng = mulberry32(4242);
            for (let trial = 0; trial < 200; trial++) {
                const arr = randomArray(rng, Math.floor(rng() * 15), -8, 8).sort(numeric);
                const target = Math.floor(rng() * 21) - 10;

                const binary = run(binarySearchSteps, arr, target);
                const linear = run(linearSearchSteps, arr, target);

                expect(last(binary).phase).toBe(last(linear).phase);
                if (last(binary).phase === 'found') expect(arr[foundIndexOf(binary)]).toBe(target);
            }
        });

        test('PRECONDITION: it does not sort for you, so unsorted input can miss a present value', () => {
            // The UI sorts the array before calling this generator. This test documents
            // why: on unsorted data binary search can report "not found" for a value that
            // is in the array.
            const unsorted = [5, 1, 2, 3, 4];
            expect(unsorted).toContain(1);
            expect(last(run(binarySearchSteps, unsorted, 1)).phase).toBe('not-found');
            expect(last(run(binarySearchSteps, [...unsorted].sort(numeric), 1)).phase).toBe('found');
        });
    });
});

// =====================================================================
// 4. THE CODE PANEL TELLS THE TRUTH
// =====================================================================
// The JavaScript snippet students read must behave exactly like the generator
// they watch. Compile the displayed snippet and compare the two.

describe.each([
    ['linear-search', 'linearSearch', linearSearchSteps, (arr) => arr],
    ['binary-search', 'binarySearch', binarySearchSteps, (arr) => [...arr].sort(numeric)],
])('displayed JavaScript snippet for %s', (id, functionName, generatorFn, prepare) => {
    const snippet = new Function(`${algorithmDatabase[id].code.javascript}\nreturn ${functionName};`)();

    test(`defines a callable ${functionName}(arr, target)`, () => {
        expect(typeof snippet).toBe('function');
    });

    test('returns the same index as the generator reports (and -1 when absent)', () => {
        inputCorpus().forEach((raw) => {
            const arr = prepare(raw);
            targetsFor(arr).forEach((target) => {
                const steps = run(generatorFn, arr, target);
                const expected = foundIndexOf(steps);

                expect({ arr, target, index: snippet([...arr], target) }).toEqual({ arr, target, index: expected });
            });
        });
    });
});
