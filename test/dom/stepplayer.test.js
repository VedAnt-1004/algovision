/** @jest-environment jsdom */
// ==========================================
// STEPPLAYER DOM/TIMER TESTS (tests/dom/stepplayer.test.js)
// ==========================================
// Covers the StepPlayer class from js/visualizer.js. Unlike the pure
// generator tests in tests/unit/, StepPlayer's next()/prev()/seekTo() always
// call the real, module-level renderStep() directly — there is no injectable
// renderer — so these tests run under jsdom with a real #visualizer-container
// and #status-bar in the DOM, exactly like index.html provides.
//
// Two techniques make StepPlayer's internals observable from outside:
//   1. A "counting" generator: a small wrapper that counts how many times its
//      underlying function* body actually runs to a new `yield` (i.e. how many
//      genuinely NEW values were pulled), as opposed to StepPlayer replaying a
//      value already sitting in its cache. This is the direct, reliable way to
//      verify "pulls from the cache without re-running the generator".
//   2. A spy on document.getElementById: renderStep() unconditionally calls
//      document.getElementById('status-bar') exactly once, every single time
//      it runs (see visualizer.js). Counting only the 'status-bar' calls is
//      therefore a reliable proxy for "how many times did a render actually
//      happen" — confirmed empirically before being used below (e.g. a
//      seekTo() that pulls 4 new values still renders exactly once, not 4
//      times).
//
// All of play()/pause()'s scheduling and the exact numbers below were
// measured against the real StepPlayer with Jest's fake timers before being
// written as assertions — including two things that are easy to get wrong:
// getSpeed() is read fresh at the moment EACH new setTimeout is scheduled
// (not continuously), and StepPlayer itself has no guard against a second
// concurrent play() call (see "known quirks" at the bottom).

import { StepPlayer, setSpeed, getSpeed } from '../../js/visualizer.js';

// ---------- Helpers ----------

beforeEach(() => {
    document.body.innerHTML = `
        <div id="visualizer-container"></div>
        <div id="status-bar" class="status-message hidden"></div>
    `;
});

afterEach(() => {
    jest.useRealTimers();
    setSpeed(500); // restore the app's real default so tests never leak speed into each other
});

// A step in the exact shape every real generator yields.
const step = (n, message = `step ${n}`) => ({
    array: [n],
    highlights: {},
    message,
    statusClass: 'searching',
    phase: `phase-${n}`,
});

// Wraps a plain array of steps in a generator function that counts every time
// its body actually advances to a new `yield` — i.e. every genuinely fresh
// pull, as opposed to a value StepPlayer already had cached.
function countingGenerator(values) {
    let pulls = 0;
    function* generatorFn() {
        for (const value of values) {
            pulls += 1;
            yield value;
        }
    }
    return { generatorFn, getPulls: () => pulls };
}

// Counts how many times renderStep() actually ran during `fn`, using the
// document.getElementById('status-bar') proxy described above.
function countRenders(fn) {
    const spy = jest.spyOn(document, 'getElementById');
    const before = spy.mock.calls.filter((call) => call[0] === 'status-bar').length;
    const result = fn();
    const renders = spy.mock.calls.filter((call) => call[0] === 'status-bar').length - before;
    spy.mockRestore();
    return { result, renders };
}

const blockValues = () => [...document.querySelectorAll('.array-block')].map((el) => el.innerText);
const statusText = () => document.getElementById('status-bar').innerText;
const statusClass = () => document.getElementById('status-bar').className;

// =====================================================================
// 1. CONSTRUCTION & BASIC DOM INTEGRATION
// =====================================================================

describe('construction', () => {
    test('starts empty: no cache, pointer before the start, not done, not playing', () => {
        const { generatorFn } = countingGenerator([step(1)]);
        const player = new StepPlayer(generatorFn);

        expect(player.cache).toEqual([]);
        expect(player.pointer).toBe(-1);
        expect(player.done).toBe(false);
        expect(player.playing).toBe(false);
        expect(player.onStep).toBeNull();
    });

    test('passes extra constructor arguments straight through to the generator function', () => {
        const seen = [];
        function* generatorFn(a, b, c) {
            seen.push(a, b, c);
            yield step(1);
        }
        new StepPlayer(generatorFn, 'x', 42, true).next();
        expect(seen).toEqual(['x', 42, true]);
    });

    test('next() renders the first step into the real DOM', () => {
        const { generatorFn } = countingGenerator([step(7, 'first message')]);
        const player = new StepPlayer(generatorFn);

        player.next();

        expect(blockValues()).toEqual([7]);
        expect(statusText()).toBe('first message');
        expect(statusClass()).toBe('status-message searching');
    });

    test('onStep fires with the exact step object that was just rendered', () => {
        const { generatorFn } = countingGenerator([step(1, 'a'), step(2, 'b')]);
        const player = new StepPlayer(generatorFn);
        const seen = [];
        player.onStep = (s) => seen.push(s.message);

        player.next();
        player.next();

        expect(seen).toEqual(['a', 'b']);
    });

    test('does not throw and returns null when asked to render before anything has been pulled', () => {
        const { generatorFn } = countingGenerator([step(1)]);
        const player = new StepPlayer(generatorFn);
        expect(player.prev()).toBeNull();
    });
});

// =====================================================================
// 2. next() / prev(): CACHE ROUND-TRIP (the generator is pulled, not re-run)
// =====================================================================

describe('next() / prev(): cache round-trip', () => {
    test('next() pulls exactly one new value from the generator each time, in order', () => {
        const { generatorFn, getPulls } = countingGenerator([step(1), step(2), step(3)]);
        const player = new StepPlayer(generatorFn);

        expect(player.next().array).toEqual([1]);
        expect(getPulls()).toBe(1);
        expect(player.next().array).toEqual([2]);
        expect(getPulls()).toBe(2);
        expect(player.next().array).toEqual([3]);
        expect(getPulls()).toBe(3);
    });

    test('next() past the end returns null repeatedly and pulls no further', () => {
        const { generatorFn, getPulls } = countingGenerator([step(1)]);
        const player = new StepPlayer(generatorFn);

        player.next();
        expect(player.next()).toBeNull();
        expect(player.next()).toBeNull();
        expect(getPulls()).toBe(1);
        expect(player.done).toBe(true);
    });

    test('prev() walks backward through the cache WITHOUT pulling from the generator again', () => {
        const { generatorFn, getPulls } = countingGenerator([step(1), step(2), step(3)]);
        const player = new StepPlayer(generatorFn);
        player.next();
        player.next();
        player.next(); // pointer=2, pulls=3

        expect(player.prev().array).toEqual([2]);
        expect(getPulls()).toBe(3); // unchanged
        expect(player.prev().array).toEqual([1]);
        expect(getPulls()).toBe(3); // still unchanged
    });

    test('prev() at (or before) the first step returns null and does not move the pointer', () => {
        const { generatorFn } = countingGenerator([step(1), step(2)]);
        const player = new StepPlayer(generatorFn);

        expect(player.prev()).toBeNull(); // pointer is -1, nothing to do
        expect(player.pointer).toBe(-1);

        player.next(); // pointer=0
        expect(player.prev()).toBeNull(); // still nothing before the first step
        expect(player.pointer).toBe(0);
    });

    test('re-entering already-cached territory with next() pulls nothing new; only crossing the frontier does', () => {
        const { generatorFn, getPulls } = countingGenerator([step(1), step(2), step(3), step(4)]);
        const player = new StepPlayer(generatorFn);
        player.next();
        player.next();
        player.next(); // pointer=2, pulls=3, cache=[1,2,3]

        player.prev();
        player.prev(); // pointer=0, pulls still 3

        expect(player.next().array).toEqual([2]); // re-served from cache
        expect(getPulls()).toBe(3);
        expect(player.next().array).toEqual([3]); // still cached
        expect(getPulls()).toBe(3);
        expect(player.next().array).toEqual([4]); // NEW: past the previous frontier
        expect(getPulls()).toBe(4);
    });

    test('every distinct step rendered updates the DOM to match exactly that step', () => {
        const { generatorFn } = countingGenerator([step(10, 'ten'), step(20, 'twenty')]);
        const player = new StepPlayer(generatorFn);

        player.next();
        expect(blockValues()).toEqual([10]);
        expect(statusText()).toBe('ten');

        player.next();
        expect(blockValues()).toEqual([20]);
        expect(statusText()).toBe('twenty');

        player.prev();
        expect(blockValues()).toEqual([10]);
        expect(statusText()).toBe('ten');
    });

    test('the returned step is a reference to the exact object the generator yielded (StepPlayer never clones it)', () => {
        const original = step(5, 'five');
        const { generatorFn } = countingGenerator([original]);
        const player = new StepPlayer(generatorFn);

        expect(player.next()).toBe(original);
    });
});

// =====================================================================
// 3. isAtStart() / isAtEnd(): BOUNDS
// =====================================================================

describe('isAtStart() / isAtEnd()', () => {
    test('a fresh, never-advanced player is at the start and not at the end', () => {
        const { generatorFn } = countingGenerator([step(1), step(2)]);
        const player = new StepPlayer(generatorFn);

        expect(player.isAtStart()).toBe(true);
        expect(player.isAtEnd()).toBe(false);
    });

    test('sitting on the very first step still counts as "at start" (Prev has nowhere to go)', () => {
        const { generatorFn } = countingGenerator([step(1), step(2)]);
        const player = new StepPlayer(generatorFn);
        player.next(); // pointer=0

        expect(player.isAtStart()).toBe(true);
    });

    test('once past the first step, isAtStart() is false', () => {
        const { generatorFn } = countingGenerator([step(1), step(2)]);
        const player = new StepPlayer(generatorFn);
        player.next();
        player.next(); // pointer=1

        expect(player.isAtStart()).toBe(false);
    });

    test('isAtEnd() only becomes true once the generator is exhausted AND the pointer sits on the last cached step', () => {
        const { generatorFn } = countingGenerator([step(1), step(2), step(3)]);
        const player = new StepPlayer(generatorFn);

        player.next(); // pointer=0, not done yet
        expect(player.isAtEnd()).toBe(false);

        player.next(); // pointer=1, still one more to pull
        expect(player.isAtEnd()).toBe(false);

        player.next(); // pointer=2 — this pull finds the generator has nothing after it... but done isn't
        // set until the NEXT call discovers exhaustion (see _pullNext), so isAtEnd() is still false here.
        expect(player.done).toBe(false);
        expect(player.isAtEnd()).toBe(false);

        expect(player.next()).toBeNull(); // this call is the one that discovers exhaustion
        expect(player.done).toBe(true);
        expect(player.isAtEnd()).toBe(true);
    });

    test('scrubbing back from the end with prev() clears isAtEnd(), even though done stays true', () => {
        const { generatorFn } = countingGenerator([step(1), step(2)]);
        const player = new StepPlayer(generatorFn);
        player.next();
        player.next();
        player.next(); // drains it: done=true, pointer=1 (last index)
        expect(player.isAtEnd()).toBe(true);

        player.prev(); // pointer=0
        expect(player.done).toBe(true); // the generator is still exhausted...
        expect(player.isAtEnd()).toBe(false); // ...but we're no longer LOOKING at the last step

        player.next(); // pointer=1 again, served from cache
        expect(player.isAtEnd()).toBe(true);
    });
});

// =====================================================================
// 4. play() / pause(): FAKE-TIMER SCHEDULING
// =====================================================================

describe('play() / pause()', () => {
    beforeEach(() => jest.useFakeTimers());

    test('play() renders the first step immediately, with no delay', () => {
        setSpeed(500);
        const { generatorFn } = countingGenerator([step(1), step(2)]);
        const player = new StepPlayer(generatorFn);

        player.play();

        expect(player.pointer).toBe(0); // no advanceTimersByTime() needed at all
        expect(player.playing).toBe(true);
    });

    test('each subsequent step waits exactly getSpeed() milliseconds', () => {
        setSpeed(100);
        const { generatorFn } = countingGenerator([step(1), step(2), step(3)]);
        const player = new StepPlayer(generatorFn);
        player.play();

        jest.advanceTimersByTime(99);
        expect(player.pointer).toBe(0); // not yet
        jest.advanceTimersByTime(1);
        expect(player.pointer).toBe(1); // exactly at 100ms

        jest.advanceTimersByTime(100);
        expect(player.pointer).toBe(2);
    });

    test('calls onFinish exactly once, exactly when the generator is exhausted, and stops playing', () => {
        setSpeed(50);
        const { generatorFn } = countingGenerator([step(1), step(2)]);
        const player = new StepPlayer(generatorFn);
        const onFinish = jest.fn();

        player.play(onFinish);
        expect(onFinish).not.toHaveBeenCalled();

        jest.advanceTimersByTime(50); // -> step 2 (pointer=1)
        expect(onFinish).not.toHaveBeenCalled();
        expect(player.playing).toBe(true);

        jest.advanceTimersByTime(50); // the tick that discovers exhaustion
        expect(onFinish).toHaveBeenCalledTimes(1);
        expect(player.playing).toBe(false);
        expect(player.isAtEnd()).toBe(true);

        jest.advanceTimersByTime(1000); // nothing further scheduled; still exactly one call
        expect(onFinish).toHaveBeenCalledTimes(1);
    });

    test('pause() stops the run: no further steps happen even as time passes', () => {
        setSpeed(100);
        const { generatorFn } = countingGenerator([step(1), step(2), step(3), step(4)]);
        const player = new StepPlayer(generatorFn);
        player.play();
        jest.advanceTimersByTime(200); // pointer=2

        player.pause();
        expect(player.playing).toBe(false);

        jest.advanceTimersByTime(1000);
        expect(player.pointer).toBe(2); // frozen
    });

    test('play() after pause() resumes from the current pointer (does not restart from the beginning)', () => {
        setSpeed(100);
        const { generatorFn } = countingGenerator([step(1), step(2), step(3), step(4)]);
        const player = new StepPlayer(generatorFn);
        player.play();
        jest.advanceTimersByTime(200); // pointer=2
        player.pause();

        player.play(); // resumes synchronously, one step forward, from pointer=2
        expect(player.pointer).toBe(3);

        jest.advanceTimersByTime(100);
        expect(player.pointer).toBe(4 - 1); // last index (3) — already there; confirm no further movement
    });

    test('getSpeed() is read fresh each time a new tick is scheduled, not just once at play()', () => {
        // The interval already scheduled by the FIRST tick keeps its original delay even if the
        // speed changes afterward — setTimeout captures its delay at call time. Only the NEXT
        // tick to be scheduled picks up the new speed.
        setSpeed(100);
        const { generatorFn } = countingGenerator([step(1), step(2), step(3)]);
        const player = new StepPlayer(generatorFn);

        player.play(); // pointer=0; schedules its next tick using speed=100
        setSpeed(30); // changed immediately after, before that scheduled tick has fired

        jest.advanceTimersByTime(100); // the already-scheduled tick still needed the full original 100ms
        expect(player.pointer).toBe(1);

        jest.advanceTimersByTime(30); // this tick was scheduled AFTER the speed change, so it used 30ms
        expect(player.pointer).toBe(2);
    });

    test('pausing an already-paused (or never-started) player is a harmless no-op', () => {
        const { generatorFn } = countingGenerator([step(1)]);
        const player = new StepPlayer(generatorFn);
        expect(() => player.pause()).not.toThrow();
        expect(() => player.pause()).not.toThrow();
        expect(player.playing).toBe(false);
    });
});

// =====================================================================
// 5. seekTo(): TIMELINE SCRUBBING
// =====================================================================

describe('seekTo()', () => {
    test('seeking forward past the current cache pulls exactly the steps needed, then renders once', () => {
        const { generatorFn, getPulls } = countingGenerator([1, 2, 3, 4, 5].map((n) => step(n)));
        const player = new StepPlayer(generatorFn);

        const { result, renders } = countRenders(() => player.seekTo(3));

        expect(getPulls()).toBe(4); // indices 0..3 pulled
        expect(renders).toBe(1); // rendered once, not once per intermediate step
        expect(player.pointer).toBe(3);
        expect(result.array).toEqual([4]);
    });

    test('seeking backward within the cache pulls nothing new and still renders exactly once', () => {
        const { generatorFn, getPulls } = countingGenerator([1, 2, 3, 4, 5].map((n) => step(n)));
        const player = new StepPlayer(generatorFn);
        player.seekTo(4); // pointer=4, cache full, pulls=5
        const pullsBefore = getPulls();

        const { result, renders } = countRenders(() => player.seekTo(1));

        expect(getPulls()).toBe(pullsBefore); // no new pulls
        expect(renders).toBe(1);
        expect(player.pointer).toBe(1);
        expect(result.array).toEqual([2]);
    });

    test('seeking to the pointer it is already on still renders exactly once (never zero)', () => {
        const { generatorFn } = countingGenerator([step(1), step(2)]);
        const player = new StepPlayer(generatorFn);
        player.next();

        const { renders } = countRenders(() => player.seekTo(0));
        expect(renders).toBe(1);
    });

    test('a negative target clamps to the first step (index 0)', () => {
        const { generatorFn } = countingGenerator([step(1), step(2), step(3)]);
        const player = new StepPlayer(generatorFn);
        player.next();
        player.next(); // pointer=1

        const result = player.seekTo(-99);

        expect(player.pointer).toBe(0);
        expect(result.array).toEqual([1]);
        expect(player.isAtStart()).toBe(true);
    });

    test('a target past the end clamps to the last real step and marks the player done', () => {
        const { generatorFn, getPulls } = countingGenerator([step(1), step(2), step(3)]);
        const player = new StepPlayer(generatorFn);

        const result = player.seekTo(999);

        expect(player.pointer).toBe(2); // last valid index, not 999
        expect(result.array).toEqual([3]);
        expect(player.done).toBe(true);
        expect(player.isAtEnd()).toBe(true);
        expect(getPulls()).toBe(3); // tried to pull further, found nothing more
    });

    test('seekTo() pauses any playback that was running', () => {
        jest.useFakeTimers();
        setSpeed(100);
        const { generatorFn } = countingGenerator([1, 2, 3, 4, 5].map((n) => step(n)));
        const player = new StepPlayer(generatorFn);
        player.play();
        expect(player.playing).toBe(true);

        player.seekTo(2);

        expect(player.playing).toBe(false);
        jest.advanceTimersByTime(1000); // nothing left running to advance the pointer further
        expect(player.pointer).toBe(2);
        jest.useRealTimers();
    });

    test('fires onStep with the target step, exactly once, on both a forward and a backward seek', () => {
        const { generatorFn } = countingGenerator([1, 2, 3, 4].map((n) => step(n)));
        const player = new StepPlayer(generatorFn);
        const seen = [];
        player.onStep = (s) => seen.push(s.array[0]);

        player.seekTo(2);
        player.seekTo(0);

        expect(seen).toEqual([3, 1]);
    });

    test('the DOM reflects only the final target step after a multi-step forward seek', () => {
        const { generatorFn } = countingGenerator([step(1, 'a'), step(2, 'b'), step(3, 'c'), step(4, 'd')]);
        const player = new StepPlayer(generatorFn);

        player.seekTo(3);

        expect(blockValues()).toEqual([4]);
        expect(statusText()).toBe('d');
    });

    test('seeking on an empty generator (no steps at all) does not throw', () => {
        const { generatorFn } = countingGenerator([]);
        const player = new StepPlayer(generatorFn);

        expect(() => player.seekTo(5)).not.toThrow();
        expect(player.pointer).toBe(-1);
        expect(player.done).toBe(true);
    });
});

// =====================================================================
// 6. KNOWN QUIRKS (verified, tracked, not failing)
// =====================================================================

describe('known quirks', () => {
    // StepPlayer.play() does not check `this.playing` before starting a new
    // tick() loop, so calling play() a second time while already playing
    // starts a SECOND, fully independent tick loop racing the first — the
    // player then advances twice as fast per interval (confirmed: two pulls
    // happen synchronously right away, and the pointer advances by 2 per
    // getSpeed() interval instead of 1). In the real app this never happens
    // because the Play button in app.js toggles based on `.playing` before
    // calling play()/pause(), so the guard lives at the call site, not here.
    test('calling play() twice while already playing runs two overlapping tick loops (2x speed)', () => {
        jest.useFakeTimers();
        setSpeed(100);
        const { generatorFn, getPulls } = countingGenerator([1, 2, 3, 4, 5].map((n) => step(n)));
        const player = new StepPlayer(generatorFn);

        player.play();
        player.play(); // called again while already playing — not guarded internally

        expect(getPulls()).toBe(2); // both calls' synchronous first tick() already ran
        expect(player.pointer).toBe(1);

        jest.advanceTimersByTime(100);
        expect(player.pointer).toBe(3); // advanced by 2 in one interval, not 1

        jest.useRealTimers();
    });

    test.todo('StepPlayer.play() should guard against starting a second concurrent tick loop internally');
});
