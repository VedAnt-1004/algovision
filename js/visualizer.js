
// ==========================================
// UNIVERSAL ANIMATION ENGINE (The Artist)
// ==========================================

// Looked up lazily (on every call) instead of once at load time, so this
// module can be imported in Node/Jest where `document` doesn't exist yet.
function getVisualizerContainer() {
    return document.getElementById('visualizer-container');
}

// --- SHARED SPEED CONTROL ---
// Every algorithm engine (search, sorting, future ones) reads its delay
// from here, so one slider in the UI controls all of them consistently.
let animationSpeed = 500; // milliseconds

export function setSpeed(ms) {
    animationSpeed = ms;
}

export function getSpeed() {
    return animationSpeed;
}

// --- WORKSPACE GENERATION (cancellation token) ---
// Incremented every buildWorkspace() call (and by each structure's clear).
// Structure-mode async operations (tree/graph/stack/queue) capture this at
// their start and re-check it after each await — if it's changed, the user
// has navigated to a different workspace mid-animation, and the operation
// should stop touching the DOM rather than "resurrecting" and overwriting
// whatever workspace is now showing.
//
// Lives here (not in app.js) because ES module imports can't be circular
// without pain: app.js imports the structure engines, and the engines need
// the token. Importers read it as a live binding; only this module can
// change it, via bumpWorkspaceGeneration().
export let workspaceGeneration = 0;

export function bumpWorkspaceGeneration() {
    workspaceGeneration++;
}

/**
 * Takes an array of numbers and draws them as blocks on the screen
 */
export function drawArray(arr) {
    const visualizerContainer = getVisualizerContainer();
    if (!visualizerContainer) return;
    visualizerContainer.innerHTML = ''; // Clear the board
    previousActiveIndices = []; // fresh run — no ghost trail carries over (spec §5.1)

    arr.forEach((value, index) => {
        // 1. Create the outer wrapper
        const wrapper = document.createElement('div');
        wrapper.classList.add('block-wrapper');

        // 2. Create the main square block
        const block = document.createElement('div');
        block.classList.add('array-block');
        block.id = `block-${index}`; // Give it an ID so we can color it later
        block.innerText = value;

        // 3. Create the little index label underneath [0], [1], etc.
        const indexLabel = document.createElement('span');
        indexLabel.classList.add('block-index');
        indexLabel.innerText = `[${index}]`;

        // 4. Put them together and add to the screen
        wrapper.appendChild(block);
        wrapper.appendChild(indexLabel);
        visualizerContainer.appendChild(wrapper);
    });
}

/**
 * Simple helper to pause code execution (used for animations)
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// STEP RENDERING (used by every generator-based engine)
// ==========================================
/**
 * Renders a single "step" snapshot: the array values plus which indices
 * are in which visual state. Every algorithm generator yields objects in
 * this shape, so this is the ONLY place that touches block DOM/classes.
 *
 * step.highlights supports: comparing[], current[], sorted[], dimmed[], found (single index)
 */
export function renderStep(step) {
    if (!step) return;
    const { array, highlights = {}, message = '', statusClass = 'searching' } = step;

    let blocks = document.querySelectorAll('.array-block');

    // Redraw from scratch if the array length changed (first render, or reset)
    if (blocks.length !== array.length) {
        drawArray(array);
        blocks = document.querySelectorAll('.array-block');
    } else {
        array.forEach((value, i) => {
            if (blocks[i].innerText != value) blocks[i].innerText = value;
        });
    }

    // Ghost trail (spec §5.1) reads the PREVIOUS step's active indices before
    // we clear them below, so it must run first.
    applyGhostTrail(blocks, highlights);

    // Clear all transient states before applying this step's highlights
    blocks.forEach(b => {
        b.classList.remove('comparing', 'current', 'sorted', 'found', 'dimmed');
        b.style.transform = '';
    });

    (highlights.sorted || []).forEach(i => blocks[i] && blocks[i].classList.add('sorted'));
    (highlights.comparing || []).forEach(i => blocks[i] && blocks[i].classList.add('comparing'));
    (highlights.current || []).forEach(i => blocks[i] && blocks[i].classList.add('current'));
    (highlights.dimmed || []).forEach(i => {
        if (blocks[i]) blocks[i].classList.add('dimmed');
    });
    if (highlights.found !== undefined && highlights.found !== null) {
        blocks[highlights.found] && blocks[highlights.found].classList.add('found');
    }

    const statusBar = document.getElementById('status-bar');
    if (statusBar) {
        statusBar.className = `status-message ${statusClass}`;
        statusBar.innerText = message;
    }
}

// ==========================================
// STEP-SCRUB GHOST TRAIL (spec §5.1)
// ==========================================
// Tracks which indices were amber ("comparing") or blue ("current") on the
// PREVIOUS render. On the next render, any of those indices that are no
// longer active get a fading ring "ghost" so a swap/comparison doesn't feel
// like an instant cut. Only the immediately-prior step ghosts — not a full
// history — to avoid clutter over a long run. Reset in drawArray() whenever
// a fresh run/redraw happens, so trails never bleed across runs.
let previousActiveIndices = [];

function applyGhostTrail(blocks, newHighlights) {
    const stillActive = new Set([...(newHighlights.comparing || []), ...(newHighlights.current || [])]);

    previousActiveIndices.forEach(({ index, color }) => {
        if (stillActive.has(index)) return; // still highlighted this step, no ghost needed
        const block = blocks[index];
        if (!block) return;

        block.classList.remove('ghost-trail-amber', 'ghost-trail-blue', 'ghost-trail-fade');
        block.classList.add('ghost-trail', `ghost-trail-${color}`);
        // Next frame: trigger the fade-out transition
        requestAnimationFrame(() => block.classList.add('ghost-trail-fade'));
        // After the transition completes, clean the classes up entirely
        setTimeout(() => {
            block.classList.remove('ghost-trail', 'ghost-trail-amber', 'ghost-trail-blue', 'ghost-trail-fade');
        }, 450);
    });

    previousActiveIndices = [
        ...(newHighlights.comparing || []).map(index => ({ index, color: 'amber' })),
        ...(newHighlights.current || []).map(index => ({ index, color: 'blue' }))
    ];
}

// ==========================================
// STEP PLAYER (drives any generator-based algorithm engine)
// ==========================================
export class StepPlayer {
    /**
     * @param {GeneratorFunction} generatorFn - a function* that yields step objects
     * @param {...any} args - arguments passed to generatorFn (e.g. array, target)
     */
    constructor(generatorFn, ...args) {
        this.generator = generatorFn(...args);
        this.cache = [];     // every step pulled so far, so Prev never re-runs logic
        this.pointer = -1;   // index into cache currently on screen
        this.done = false;
        this.playing = false;
        this._timer = null;
        this.onStep = null; // optional callback(step) fired whenever a step is rendered
    }

    _pullNext() {
        if (this.pointer < this.cache.length - 1) {
            this.pointer++;
            return this.cache[this.pointer];
        }
        if (this.done) return null;
        const result = this.generator.next();
        if (result.done) {
            this.done = true;
            return null;
        }
        this.cache.push(result.value);
        this.pointer++;
        return result.value;
    }

    next() {
        const step = this._pullNext();
        if (step) {
            renderStep(step);
            if (this.onStep) this.onStep(step);
        }
        return step;
    }

    prev() {
        if (this.pointer <= 0) return null;
        this.pointer--;
        const step = this.cache[this.pointer];
        renderStep(step);
        if (this.onStep) this.onStep(step);
        return step;
    }

    play(onFinish) {
        this.playing = true;
        const tick = () => {
            if (!this.playing) return;
            const step = this.next();
            if (!step) {
                this.playing = false;
                if (onFinish) onFinish();
                return;
            }
            this._timer = setTimeout(tick, getSpeed());
        };
        tick();
    }

    pause() {
        this.playing = false;
        clearTimeout(this._timer);
    }

    // Jumps directly to an arbitrary step index (used by the timeline
    // scrubber). Walks forward via _pullNext (cached or freshly generated,
    // same as next()) or backward by moving the pointer within the cache —
    // but renders only once, at the final position, instead of once per
    // intermediate step like repeated next()/prev() calls would.
    seekTo(targetIndex) {
        this.pause();
        if (targetIndex < 0) targetIndex = 0;

        while (this.pointer < targetIndex) {
            const pulled = this._pullNext();
            if (!pulled) break; // generator exhausted before reaching target
        }
        while (this.pointer > targetIndex) {
            this.pointer--;
        }

        const step = this.cache[this.pointer];
        if (step) {
            renderStep(step);
            if (this.onStep) this.onStep(step);
        }
        return step;
    }

    isAtStart() {
        return this.pointer <= 0;
    }

    isAtEnd() {
        return this.done && this.pointer >= this.cache.length - 1;
    }
}
