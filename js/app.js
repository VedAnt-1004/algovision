// ==========================================
// MAIN UI MANAGER
// ==========================================

let currentActiveCodes = {}; // Stores code for the currently selected algorithm
let activePlayer = null; // The StepPlayer currently driving the visualizer, if any
let currentAlgoId = null; // Which algorithm the workspace is currently showing
// Incremented every buildWorkspace() call. Structure-mode async operations
// (tree/graph/stack/queue) capture this at their start and re-check it after
// each await — if it's changed, the user has navigated to a different
// workspace mid-animation, and the operation should stop touching the DOM
// rather than "resurrecting" and overwriting whatever workspace is now showing.
let workspaceGeneration = 0;
let lastRenderedStep = null; // The most recent step object, used to re-sync code highlight on tab switch

// --- CODE PANEL: line-by-line rendering + active-line sync ---
function renderCodeLines(codeString) {
    const codeS = document.getElementById('code-snippet');
    if (!codeS || typeof codeString !== 'string') return;

    const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    codeS.innerHTML = codeString.split('\n').map((line, idx) => {
        const content = line.length > 0 ? escape(line) : '&nbsp;';
        return `<div class="code-line" data-line="${idx + 1}">${content}</div>`;
    }).join('');
}

function highlightCodeLine(lineNumber) {
    document.querySelectorAll('.code-line').forEach(el => el.classList.remove('active-line'));
    const target = document.querySelector(`.code-line[data-line="${lineNumber}"]`);
    if (target) {
        target.classList.add('active-line');
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function clearCodeHighlight() {
    document.querySelectorAll('.code-line').forEach(el => el.classList.remove('active-line'));
}

// Called whenever the player moves (Next/Prev/Play tick) AND whenever the code tab changes,
// so the highlighted line always matches the step currently on screen — for
// whichever language tab (JS/Python/C++) happens to be active.
function refreshCodeHighlight() {
    const activeTab = document.querySelector('.tab-btn.active');
    const langKeyByLabel = { 'JS': 'javascript', 'Python': 'python', 'C++': 'cpp' };
    const activeLangKey = activeTab ? langKeyByLabel[activeTab.innerText] : null;

    if (!lastRenderedStep || !activeLangKey) {
        clearCodeHighlight();
        return;
    }

    const data = algorithmDatabase[currentAlgoId];
    const line = data && data.lineMap && data.lineMap[activeLangKey] && lastRenderedStep.phase
        ? data.lineMap[activeLangKey][lastRenderedStep.phase]
        : null;

    if (line) highlightCodeLine(line);
    else clearCodeHighlight();
}

function onPlayerStep(step) {
    lastRenderedStep = step;
    refreshCodeHighlight();
    updateTelemetry();
    syncScrubber();
}

// --- 1. SCREEN NAVIGATION ENGINE ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.classList.add('hidden');
    });

    const target = document.getElementById(screenId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
}

// A card is "Algorithm mode" (StepPlayer-driven run) if its type is search/sorting;
// everything else (stack/queue/tree/graph) is "Structure mode" (live, no timeline).
function getCardMode(algoType) {
    return (algoType === 'search' || algoType === 'sorting') ? 'algorithm' : 'structure';
}

// --- Card visual glyphs (dashboard redesign) ---
// Simple geometric SVGs standing in for the wireframe's photo placeholders —
// we have no imagery per algorithm, so a colored icon glyph fills the same
// "card art" role. Colored via currentColor so the surrounding
// .algo-card-visual (category-tinted) controls the actual hue.
const ALGO_ICONS = {
    search: '<svg viewBox="0 0 48 48"><circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="3"/><line x1="29" y1="29" x2="40" y2="40" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    sorting: '<svg viewBox="0 0 48 48"><rect x="6" y="28" width="7" height="14" fill="currentColor"/><rect x="17" y="20" width="7" height="22" fill="currentColor"/><rect x="28" y="10" width="7" height="32" fill="currentColor"/><rect x="39" y="24" width="7" height="18" fill="currentColor"/></svg>',
    stack: '<svg viewBox="0 0 48 48"><rect x="10" y="8" width="28" height="9" rx="2" fill="currentColor"/><rect x="10" y="20" width="28" height="9" rx="2" fill="currentColor" opacity="0.7"/><rect x="10" y="32" width="28" height="9" rx="2" fill="currentColor" opacity="0.45"/></svg>',
    queue: '<svg viewBox="0 0 48 48"><rect x="4" y="18" width="9" height="12" rx="2" fill="currentColor"/><rect x="16" y="18" width="9" height="12" rx="2" fill="currentColor" opacity="0.7"/><rect x="28" y="18" width="9" height="12" rx="2" fill="currentColor" opacity="0.45"/><path d="M40 18 L46 24 L40 30" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tree: '<svg viewBox="0 0 48 48"><line x1="24" y1="12" x2="14" y2="26" stroke="currentColor" stroke-width="2" opacity="0.5"/><line x1="24" y1="12" x2="34" y2="26" stroke="currentColor" stroke-width="2" opacity="0.5"/><line x1="14" y1="26" x2="8" y2="38" stroke="currentColor" stroke-width="2" opacity="0.5"/><line x1="14" y1="26" x2="20" y2="38" stroke="currentColor" stroke-width="2" opacity="0.5"/><circle cx="24" cy="12" r="6" fill="currentColor"/><circle cx="14" cy="26" r="5" fill="currentColor" opacity="0.8"/><circle cx="34" cy="26" r="5" fill="currentColor" opacity="0.8"/><circle cx="8" cy="38" r="4" fill="currentColor" opacity="0.6"/><circle cx="20" cy="38" r="4" fill="currentColor" opacity="0.6"/></svg>',
    graph: '<svg viewBox="0 0 48 48"><line x1="12" y1="12" x2="36" y2="14" stroke="currentColor" stroke-width="2" opacity="0.5"/><line x1="36" y1="14" x2="30" y2="36" stroke="currentColor" stroke-width="2" opacity="0.5"/><line x1="30" y1="36" x2="10" y2="32" stroke="currentColor" stroke-width="2" opacity="0.5"/><line x1="10" y1="32" x2="12" y2="12" stroke="currentColor" stroke-width="2" opacity="0.5"/><line x1="12" y1="12" x2="30" y2="36" stroke="currentColor" stroke-width="2" opacity="0.35"/><circle cx="12" cy="12" r="5" fill="currentColor"/><circle cx="36" cy="14" r="5" fill="currentColor" opacity="0.8"/><circle cx="30" cy="36" r="5" fill="currentColor" opacity="0.8"/><circle cx="10" cy="32" r="5" fill="currentColor" opacity="0.6"/></svg>'
};

function getAlgoIconSVG(algoType) {
    return ALGO_ICONS[algoType] || '';
}

// Rough fastest-to-slowest ordering for the "Complexity" sort option.
const COMPLEXITY_RANK = { 'O(1)': 0, 'O(log n)': 1, 'O(n)': 2, 'O(V + E)': 2.5, 'O(n log n)': 3, 'O(n²)': 4 };
function getComplexityRank(bigO) {
    return COMPLEXITY_RANK[bigO] !== undefined ? COMPLEXITY_RANK[bigO] : 99;
}

// --- 2. DYNAMIC DASHBOARD BUILDER ---
// Rebuilds the card grid for a category. Filtering/sorting (type/mode/sort
// dropdowns) is handled separately by applyDashboardFilters() so switching
// those doesn't require rebuilding cards from scratch.
function buildDashboard(categoryId) {
    const dashboardContainer = document.querySelector('.dashboard-container');
    dashboardContainer.innerHTML = '';

    const relevantAlgos = [];
    for (const key in algorithmDatabase) {
        if (algorithmDatabase[key].category === categoryId) {
            relevantAlgos.push(Object.assign({ id: key }, algorithmDatabase[key]));
        }
    }

    if (relevantAlgos.length === 0) {
        dashboardContainer.innerHTML = '<div class="coming-soon-panel"><h2>Working on this! More modules arriving soon.</h2><p>Linear Search and Binary Search (Array -> Searching) are active.</p></div>';
        populateTypeFilter([]);
        return;
    }

    // Populate the Type dropdown with whichever sub-types this category
    // actually has (e.g. Array: Searching + Sorting; most others: just one).
    const types = [...new Set(relevantAlgos.map(a => a.type))];
    populateTypeFilter(types);

    const cardGrid = document.createElement('div');
    cardGrid.classList.add('card-grid');

    relevantAlgos.forEach(algo => {
        const cardId = algo.id;
        const mode = getCardMode(algo.type);
        const modeLabel = mode === 'algorithm' ? '▶ Algorithm' : '⚡ Structure';
        const worstComplexity = algo.complexities ? algo.complexities.worst : '';
        const iconSVG = getAlgoIconSVG(algo.type);

        const card = document.createElement('div');
        card.classList.add('algo-card', `algo-card-${categoryId}`);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Open ${algo.title} workspace`);
        card.dataset.type = algo.type;
        card.dataset.mode = mode;
        card.dataset.complexityRank = getComplexityRank(worstComplexity);
        card.dataset.title = algo.title;

        card.innerHTML = `
            <div class="algo-card-visual">${iconSVG}</div>
            <div class="algo-card-caption">
                <div class="algo-card-caption-top">
                    <span class="algo-card-title">${algo.title}</span>
                    <span class="arrow">›</span>
                </div>
                <div class="algo-card-tags">
                    <span class="mode-badge">${modeLabel}</span>
                </div>
            </div>
        `;

        const openWorkspace = () => {
            if (cardId && algorithmDatabase[cardId]) {
                buildWorkspace(cardId);
                showScreen('workspace-screen');
                window.scrollTo(0, 0);
            }
        };
        card.addEventListener('click', openWorkspace);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openWorkspace();
            }
        });

        cardGrid.appendChild(card);
    });

    dashboardContainer.appendChild(cardGrid);
    applyDashboardFilters(); // apply whatever the Mode/Sort dropdowns are currently set to
}

// Populates the Type dropdown for the current category, resetting it to
// "All Types" (the available types differ per category, so a stale
// selection from a previous category wouldn't make sense to keep).
function populateTypeFilter(types) {
    const select = document.getElementById('dash-type-filter');
    if (!select) return;
    select.innerHTML = '<option value="all">All Types</option>';
    types.forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        select.appendChild(opt);
    });
    select.value = 'all';
    select.disabled = types.length <= 1; // nothing meaningful to filter with only one type
}

// Reads the current Type/Mode/Sort dropdown values and applies them to
// whatever cards are currently in the grid — show/hide for type+mode,
// DOM reordering for sort. Called after every dashboard rebuild AND
// directly from the dropdowns' own change handlers.
function applyDashboardFilters() {
    const cardGrid = document.querySelector('.card-grid');
    if (!cardGrid) return;

    const typeFilter = document.getElementById('dash-type-filter')?.value || 'all';
    const modeFilter = document.getElementById('dash-mode-filter')?.value || 'all';
    const sortBy = document.getElementById('dash-sort-select')?.value || 'default';

    const cards = Array.from(cardGrid.children);

    cards.forEach(card => {
        const matchesType = typeFilter === 'all' || card.dataset.type === typeFilter;
        const matchesMode = modeFilter === 'all' || card.dataset.mode === modeFilter;
        card.style.display = (matchesType && matchesMode) ? '' : 'none';
    });

    if (sortBy === 'name') {
        cards.sort((a, b) => a.dataset.title.localeCompare(b.dataset.title));
        cards.forEach(c => cardGrid.appendChild(c));
    } else if (sortBy === 'complexity') {
        cards.sort((a, b) => parseFloat(a.dataset.complexityRank) - parseFloat(b.dataset.complexityRank));
        cards.forEach(c => cardGrid.appendChild(c));
    }
    // 'default' — leave cards in their original insertion order, no re-sort needed
}

// --- 3. WORKSPACE BUILDER (Unchanged) ---
function buildWorkspace(algoId) {
    const data = algorithmDatabase[algoId];
    
    if (!data) {
        console.error("Algorithm not found in database:", algoId);
        return;
    }

    currentAlgoId = algoId;
    lastRenderedStep = null; // fresh workspace, no step to highlight yet
    workspaceGeneration++; // invalidate any in-flight tree/graph/stack/queue animation from the previous workspace

    // Update UI Labels
    const navTitle = document.getElementById('nav-title');
    const desc = document.getElementById('algo-description');
    const timeW = document.getElementById('time-worst');
    const spaceC = document.getElementById('space-complexity');
    
    if (navTitle) navTitle.innerText = data.title;
    if (desc) desc.innerText = data.description;
    if (timeW) timeW.innerText = data.complexities.worst;
    if (spaceC) spaceC.innerText = data.complexities.space;
    
    if (data.code) {
        currentActiveCodes = data.code; 
        renderCodeLines(currentActiveCodes.javascript); // Default to JS
        
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(t => t.classList.remove('active'));
        if(tabs.length > 0) tabs[0].classList.add('active'); 
    }

    // Stop and clear whatever was playing in the previous workspace
    if (activePlayer) {
        activePlayer.pause();
        activePlayer = null;
    }

    // Reset the shared visualizer surface — without this, switching from a
    // Stack/Queue workspace into Search/Sort (or vice versa) would leave a
    // stale stack-mode/queue-mode class or leftover blocks on screen.
    const visualizerContainerEl = document.getElementById('visualizer-container');
    if (visualizerContainerEl) {
        visualizerContainerEl.innerHTML = '';
        visualizerContainerEl.classList.remove('stack-mode', 'queue-mode', 'tree-mode', 'graph-mode');
    }
    const statusBarEl = document.getElementById('status-bar');
    if (statusBarEl) statusBarEl.className = 'status-message hidden';

    // Telemetry HUD only applies to Algorithm-mode (StepPlayer-driven) runs —
    // Structure-mode (stack/queue/tree/graph) has no step sequence to track
    // comparisons/swaps against, so it's hidden there (Phase 5 gives
    // Structure mode its own dock instead).
    const isAlgorithmMode = (data.type === 'search' || data.type === 'sorting');
    const telemetryHud = document.getElementById('telemetry-hud');
    if (telemetryHud) telemetryHud.classList.toggle('hidden', !isAlgorithmMode);
    updateTelemetry(); // no activePlayer yet at this point, so this resets to defaults
    syncScrubber();
    resetSessionHistory();

    // Close the theory drawer if it was left open from a previous workspace
    const theoryDrawerEl = document.getElementById('theory-drawer');
    const theoryScrimEl = document.getElementById('theory-scrim');
    const theoryPeekTabEl = document.getElementById('theory-peek-tab');
    if (theoryDrawerEl) {
        theoryDrawerEl.classList.remove('open');
        theoryDrawerEl.setAttribute('aria-hidden', 'true');
    }
    if (theoryScrimEl) theoryScrimEl.classList.remove('open');
    if (theoryPeekTabEl) {
        theoryPeekTabEl.classList.remove('hidden');
        theoryPeekTabEl.setAttribute('aria-expanded', 'false');
    }

    // Build the Control Panel
    const controlsZone = document.getElementById('dynamic-controls');

    const playbackControlsHTML = `
                <button id="prev-btn" class="dashboard-btn btn-secondary" disabled>◀</button>
                <button id="play-btn" class="dashboard-btn btn-blue" disabled>▶ Play</button>
                <button id="next-btn" class="dashboard-btn btn-secondary" disabled>▶</button>
                <input type="range" id="step-scrubber" aria-label="Timeline" min="0" max="0" value="0" step="1" disabled>`;

    if (data.type === "search") {
        controlsZone.innerHTML = `
            <div class="dock-zone dock-zone-setup">
                <input type="text" id="array-input" class="dashboard-input wireframe-array-input" placeholder="e.g. 3, 1, 4, 1, 5">
                <input type="number" id="target-input" class="dashboard-input wireframe-target-input" placeholder="Target">
                <button id="random-btn" class="dashboard-btn btn-secondary">Random</button>
                <button id="reset-btn" class="dashboard-btn btn-red">Reset</button>
            </div>

            <div class="dock-zone dock-zone-primary">
                <button id="action-btn" class="dashboard-btn btn-blue wireframe-search-btn">Search</button>
            </div>

            <div class="dock-zone dock-zone-playback">
                <label class="speed-label" for="speed-slider">Speed</label>
                <input type="range" id="speed-slider" min="100" max="1000" step="50" value="500">
                ${playbackControlsHTML}
            </div>
        `;

        document.getElementById('random-btn').addEventListener('click', () => {
            let randomArr = Array.from({length: 7}, () => Math.floor(Math.random() * 99) + 1);
            if (algoId === 'binary-search') randomArr.sort((a, b) => a - b);
            document.getElementById('array-input').value = randomArr.join(', ');
            document.getElementById('target-input').value = randomArr[Math.floor(Math.random() * randomArr.length)];
        });

        document.getElementById('reset-btn').addEventListener('click', () => {
            document.getElementById('array-input').value = '';
            document.getElementById('target-input').value = '';
            document.getElementById('visualizer-container').innerHTML = '';
            document.getElementById('status-bar').className = 'status-message hidden';
            if (activePlayer) { activePlayer.pause(); activePlayer = null; }
            lastRenderedStep = null;
            clearCodeHighlight();
            updatePlaybackButtons();
        });

        document.getElementById('speed-slider').addEventListener('input', (e) => {
            setSpeed(1100 - parseInt(e.target.value));
        });

        document.getElementById('action-btn').addEventListener('click', () => {
            const arrayInput = document.getElementById('array-input').value;
            const targetInput = document.getElementById('target-input').value;

            let arr = arrayInput.split(',').map(num => parseInt(num.trim())).filter(num => !isNaN(num));
            const target = parseInt(targetInput);

            if (arr.length === 0 || isNaN(target)) {
                alert("Please enter valid numbers.");
                return;
            }

            if (algoId === 'binary-search') {
                arr.sort((a, b) => a - b);
                document.getElementById('array-input').value = arr.join(', ');
            }

            const generators = { 'linear-search': linearSearchSteps, 'binary-search': binarySearchSteps };
            startPlayer(generators[algoId], arr, target);
        });

        setupPlaybackButtons();
    }

    else if (data.type === "sorting") {
        controlsZone.innerHTML = `
            <div class="dock-zone dock-zone-setup">
                <input type="text" id="array-input" class="dashboard-input wireframe-array-input" placeholder="e.g. 5, 3, 8, 1, 9">
                <button id="random-btn" class="dashboard-btn btn-secondary">Random</button>
                <button id="reset-btn" class="dashboard-btn btn-red">Reset</button>
            </div>

            <div class="dock-zone dock-zone-primary">
                <button id="action-btn" class="dashboard-btn btn-blue">Sort</button>
            </div>

            <div class="dock-zone dock-zone-playback">
                <label class="speed-label" for="speed-slider">Speed</label>
                <input type="range" id="speed-slider" min="100" max="1000" step="50" value="500">
                ${playbackControlsHTML}
            </div>
        `;

        const generators = {
            'bubble-sort': bubbleSortSteps,
            'selection-sort': selectionSortSteps,
            'insertion-sort': insertionSortSteps,
            'merge-sort': mergeSortSteps,
            'quick-sort': quickSortSteps
        };

        document.getElementById('random-btn').addEventListener('click', () => {
            let randomArr = Array.from({length: 8}, () => Math.floor(Math.random() * 99) + 1);
            document.getElementById('array-input').value = randomArr.join(', ');
        });

        document.getElementById('reset-btn').addEventListener('click', () => {
            document.getElementById('array-input').value = '';
            document.getElementById('visualizer-container').innerHTML = '';
            document.getElementById('status-bar').className = 'status-message hidden';
            if (activePlayer) { activePlayer.pause(); activePlayer = null; }
            lastRenderedStep = null;
            clearCodeHighlight();
            updatePlaybackButtons();
        });

        document.getElementById('speed-slider').addEventListener('input', (e) => {
            setSpeed(1100 - parseInt(e.target.value));
        });

        document.getElementById('action-btn').addEventListener('click', () => {
            const arrayInput = document.getElementById('array-input').value;
            let arr = arrayInput.split(',').map(num => parseInt(num.trim())).filter(num => !isNaN(num));

            if (arr.length === 0) {
                alert("Please enter valid numbers.");
                return;
            }

            startPlayer(generators[algoId], arr);
        });

        setupPlaybackButtons();
    }

    else if (data.type === "stack") {
        // Live/persistent structure — no step player, no playback row.
        stackState = [];

        controlsZone.innerHTML = `
            <div class="dock-zone dock-zone-setup">
                <input type="number" id="value-input" class="dashboard-input" placeholder="Value to push">
            </div>

            <div class="dock-zone dock-zone-primary">
                <button id="push-btn" class="dashboard-btn btn-blue">Push</button>
            </div>

            <div class="dock-zone dock-zone-playback">
                <button id="pop-btn" class="dashboard-btn btn-red">Pop</button>
                <button id="peek-btn" class="dashboard-btn btn-secondary">Peek</button>
                <button id="clear-btn" class="dashboard-btn btn-secondary">Clear</button>
            </div>
        `;

        renderStack(); // show the empty state immediately

        const valueInput = document.getElementById('value-input');
        const readValue = () => {
            const value = parseInt(valueInput.value);
            if (isNaN(value)) {
                alert('Enter a valid number to push.');
                return null;
            }
            return value;
        };

        document.getElementById('push-btn').addEventListener('click', () => {
            const value = readValue();
            if (value === null) return;
            pushToStack(value);
            logSessionAction(`Pushed ${value}`);
            valueInput.value = '';
        });

        document.getElementById('pop-btn').addEventListener('click', () => {
            const poppedValue = stackState[stackState.length - 1];
            popFromStack();
            if (poppedValue !== undefined) logSessionAction(`Popped ${poppedValue}`);
        });

        document.getElementById('peek-btn').addEventListener('click', () => {
            peekStack();
            if (stackState.length > 0) logSessionAction(`Peeked ${stackState[stackState.length - 1]}`);
        });

        wireClearConfirm(document.getElementById('clear-btn'), () => {
            clearStack();
            logSessionAction('Cleared stack');
        });

        // Enter key pushes, same as clicking Push
        valueInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('push-btn').click();
        });
    }

    else if (data.type === "queue") {
        queueState = [];

        controlsZone.innerHTML = `
            <div class="dock-zone dock-zone-setup">
                <input type="number" id="value-input" class="dashboard-input" placeholder="Value to enqueue">
            </div>

            <div class="dock-zone dock-zone-primary">
                <button id="enqueue-btn" class="dashboard-btn btn-blue">Enqueue</button>
            </div>

            <div class="dock-zone dock-zone-playback">
                <button id="dequeue-btn" class="dashboard-btn btn-red">Dequeue</button>
                <button id="peek-btn" class="dashboard-btn btn-secondary">Peek</button>
                <button id="clear-btn" class="dashboard-btn btn-secondary">Clear</button>
            </div>
        `;

        renderQueue();

        const valueInput = document.getElementById('value-input');
        const readValue = () => {
            const value = parseInt(valueInput.value);
            if (isNaN(value)) {
                alert('Enter a valid number to enqueue.');
                return null;
            }
            return value;
        };

        document.getElementById('enqueue-btn').addEventListener('click', () => {
            const value = readValue();
            if (value === null) return;
            enqueue(value);
            logSessionAction(`Enqueued ${value}`);
            valueInput.value = '';
        });

        document.getElementById('dequeue-btn').addEventListener('click', () => {
            const dequeuedValue = queueState[0];
            dequeue();
            if (dequeuedValue !== undefined) logSessionAction(`Dequeued ${dequeuedValue}`);
        });

        document.getElementById('peek-btn').addEventListener('click', () => {
            peekQueue();
            if (queueState.length > 0) logSessionAction(`Peeked ${queueState[0]}`);
        });

        wireClearConfirm(document.getElementById('clear-btn'), () => {
            clearQueue();
            logSessionAction('Cleared queue');
        });

        valueInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('enqueue-btn').click();
        });
    }

    else if (data.type === "tree") {
        treeRoot = null;

        controlsZone.innerHTML = `
            <div class="dock-zone dock-zone-setup">
                <input type="number" id="value-input" class="dashboard-input" placeholder="Value">
            </div>

            <div class="dock-zone dock-zone-primary">
                <button id="insert-btn" class="dashboard-btn btn-blue">Insert</button>
            </div>

            <div class="dock-zone dock-zone-playback">
                <button id="search-btn" class="dashboard-btn btn-secondary">Search</button>
                <button id="delete-btn" class="dashboard-btn btn-red">Delete</button>
                <button id="random-btn" class="dashboard-btn btn-secondary">Random Tree</button>
                <button id="clear-btn" class="dashboard-btn btn-red">Clear</button>
            </div>

            <div class="dock-zone traversal-row">
                <button id="inorder-btn" class="dashboard-btn btn-secondary">In-Order</button>
                <button id="preorder-btn" class="dashboard-btn btn-secondary">Pre-Order</button>
                <button id="postorder-btn" class="dashboard-btn btn-secondary">Post-Order</button>
            </div>
        `;

        renderTree(); // show the empty state immediately

        const valueInput = document.getElementById('value-input');
        const readValue = () => {
            const value = parseInt(valueInput.value);
            if (isNaN(value)) {
                alert('Enter a valid number.');
                return null;
            }
            return value;
        };

        document.getElementById('insert-btn').addEventListener('click', async () => {
            const value = readValue();
            if (value === null) return;
            await insertNode(value);
            logSessionAction(`Inserted ${value}`);
            valueInput.value = '';
        });

        document.getElementById('search-btn').addEventListener('click', () => {
            const value = readValue();
            if (value === null) return;
            searchTree(value);
            logSessionAction(`Searched ${value}`);
        });

        document.getElementById('delete-btn').addEventListener('click', () => {
            const value = readValue();
            if (value === null) return;
            deleteNode(value);
            logSessionAction(`Deleted ${value}`);
            valueInput.value = '';
        });

        document.getElementById('random-btn').addEventListener('click', async () => {
            clearTree();
            const values = new Set();
            while (values.size < 7) {
                values.add(Math.floor(Math.random() * 90) + 10);
            }
            for (const v of values) {
                await insertNode(v);
            }
            logSessionAction('Generated random tree');
        });

        wireClearConfirm(document.getElementById('clear-btn'), () => {
            clearTree();
            logSessionAction('Cleared tree');
        });

        document.getElementById('inorder-btn').addEventListener('click', () => {
            runTraversal('inorder');
            logSessionAction('In-Order traversal');
        });

        document.getElementById('preorder-btn').addEventListener('click', () => {
            runTraversal('preorder');
            logSessionAction('Pre-Order traversal');
        });

        document.getElementById('postorder-btn').addEventListener('click', () => {
            runTraversal('postorder');
            logSessionAction('Post-Order traversal');
        });

        valueInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('insert-btn').click();
        });
    }

    else if (data.type === "graph") {
        graphNodes = {};
        graphEdges = [];

        controlsZone.innerHTML = `
            <div class="dock-zone dock-zone-setup">
                <input type="text" id="node-input" class="dashboard-input" placeholder="Node (e.g. A)" maxlength="3">
                <button id="add-node-btn" class="dashboard-btn btn-secondary">Add Node</button>
                <input type="text" id="edge-from-input" class="dashboard-input" placeholder="From" maxlength="3">
                <input type="text" id="edge-to-input" class="dashboard-input" placeholder="To" maxlength="3">
                <button id="add-edge-btn" class="dashboard-btn btn-secondary">Add Edge</button>
            </div>

            <div class="dock-zone dock-zone-primary">
                <input type="text" id="start-node-input" class="dashboard-input" placeholder="Start node" maxlength="3">
                <button id="bfs-btn" class="dashboard-btn btn-blue">BFS</button>
            </div>

            <div class="dock-zone dock-zone-playback">
                <button id="dfs-btn" class="dashboard-btn btn-secondary">DFS</button>
                <button id="random-btn" class="dashboard-btn btn-secondary">Random Graph</button>
                <button id="clear-btn" class="dashboard-btn btn-red">Clear</button>
            </div>
        `;

        renderGraph(); // show the empty state immediately

        document.getElementById('add-node-btn').addEventListener('click', () => {
            const input = document.getElementById('node-input');
            const id = input.value.trim();
            const statusBar = document.getElementById('status-bar');
            if (!id) { alert('Enter a node label.'); return; }

            if (addNode(id)) {
                statusBar.className = 'status-message success';
                statusBar.innerText = `Added node ${id}`;
            } else {
                statusBar.className = 'status-message error';
                statusBar.innerText = `Node ${id} already exists`;
            }
            input.value = '';
        });

        document.getElementById('add-edge-btn').addEventListener('click', () => {
            const fromInput = document.getElementById('edge-from-input');
            const toInput = document.getElementById('edge-to-input');
            const u = fromInput.value.trim();
            const v = toInput.value.trim();
            const statusBar = document.getElementById('status-bar');
            if (!u || !v) { alert('Enter both node labels.'); return; }

            if (addEdge(u, v)) {
                statusBar.className = 'status-message success';
                statusBar.innerText = `Added edge ${u} — ${v}`;
            } else {
                statusBar.className = 'status-message error';
                statusBar.innerText = `Couldn't add that edge (missing node, duplicate, or self-loop)`;
            }
            fromInput.value = '';
            toInput.value = '';
        });

        document.getElementById('bfs-btn').addEventListener('click', () => {
            const start = document.getElementById('start-node-input').value.trim();
            if (!start) { alert('Enter a start node.'); return; }
            bfsTraversal(start);
        });

        document.getElementById('dfs-btn').addEventListener('click', () => {
            const start = document.getElementById('start-node-input').value.trim();
            if (!start) { alert('Enter a start node.'); return; }
            dfsTraversal(start);
        });

        document.getElementById('random-btn').addEventListener('click', () => {
            generateRandomGraph();
        });

        wireClearConfirm(document.getElementById('clear-btn'), () => {
            clearGraph();
        });
    }
}

// --- 3b. SHARED PLAYBACK HELPERS (used by both search and sorting workspaces) ---

// Creates a fresh StepPlayer from a generator + its args, then auto-plays it —
// matches the original "click Search/Sort and watch it run" behavior. The
// Prev/Play/Next controls let the user pause and step through at any point
// during or after that run; they're not required just to see it happen.
function startPlayer(generatorFn, ...args) {
    if (!generatorFn) return;
    if (activePlayer) activePlayer.pause();

    activePlayer = new StepPlayer(generatorFn, ...args);
    activePlayer.onStep = onPlayerStep;
    activePlayer.play(() => updatePlaybackButtons());
    updatePlaybackButtons();
}

// --- Telemetry HUD (spec: Comparisons / Swaps / Current Index) ---
// Derived from the player's step cache rather than a separate running
// counter, so Prev/scrubbing backward shows historically-accurate counts
// for wherever the player currently is — not just "highest reached so far".
function updateTelemetry() {
    const comparisonsEl = document.getElementById('telemetry-comparisons');
    const swapsEl = document.getElementById('telemetry-swaps');
    const indicesEl = document.getElementById('telemetry-indices');
    if (!comparisonsEl || !swapsEl || !indicesEl) return;

    if (!activePlayer) {
        comparisonsEl.innerText = '0';
        swapsEl.innerText = '0';
        indicesEl.innerText = '—';
        return;
    }

    const stepsSoFar = activePlayer.cache.slice(0, activePlayer.pointer + 1);
    const comparisonPhases = ['compare', 'checking', 'compare-shift'];
    const comparisons = stepsSoFar.filter(s => comparisonPhases.includes(s.phase)).length;
    const swaps = stepsSoFar.filter(s => s.phase === 'swap').length;

    const last = stepsSoFar[stepsSoFar.length - 1];
    let indicesText = '—';
    if (last && last.highlights) {
        const idxs = [...(last.highlights.current || []), ...(last.highlights.comparing || [])];
        if (idxs.length) {
            indicesText = idxs.join(', ');
        } else if (last.highlights.found !== undefined && last.highlights.found !== null) {
            indicesText = String(last.highlights.found);
        }
    }

    comparisonsEl.innerText = String(comparisons);
    swapsEl.innerText = String(swaps);
    indicesEl.innerText = indicesText;
}

// --- Timeline scrubber sync ---
// Grows its max as the run progresses (the generator is lazy, so the total
// step count isn't known until the run finishes) and reflects the player's
// current pointer position.
function syncScrubber() {
    const scrubber = document.getElementById('step-scrubber');
    if (!scrubber) return;
    if (!activePlayer) {
        scrubber.disabled = true;
        scrubber.max = 0;
        scrubber.value = 0;
        return;
    }
    scrubber.disabled = false;
    scrubber.max = Math.max(activePlayer.cache.length - 1, 0);
    scrubber.value = activePlayer.pointer;
}

// Enables/disables Prev/Next/Play based on the player's current position.
function updatePlaybackButtons() {
    const prevBtn = document.getElementById('prev-btn');
    const playBtn = document.getElementById('play-btn');
    const nextBtn = document.getElementById('next-btn');

    if (prevBtn && playBtn && nextBtn) {
        const hasPlayer = !!activePlayer;
        prevBtn.disabled = !hasPlayer || activePlayer.isAtStart();
        nextBtn.disabled = !hasPlayer || activePlayer.isAtEnd();
        playBtn.disabled = !hasPlayer || activePlayer.isAtEnd();
        playBtn.innerText = hasPlayer && activePlayer.playing ? '⏸ Pause' : '▶ Play';
    }

    // Folded in here too (not just onPlayerStep) so every call site that
    // already calls updatePlaybackButtons — Reset, manual Prev/Next, etc —
    // gets telemetry/scrubber sync for free without touching those call sites.
    updateTelemetry();
    syncScrubber();
}

// Wires the Prev/Play/Next buttons once per workspace build (buttons are recreated each time).
function setupPlaybackButtons() {
    document.getElementById('prev-btn').addEventListener('click', () => {
        if (!activePlayer) return;
        activePlayer.pause();
        activePlayer.prev();
        updatePlaybackButtons();
    });

    document.getElementById('next-btn').addEventListener('click', () => {
        if (!activePlayer) return;
        activePlayer.pause();
        activePlayer.next();
        updatePlaybackButtons();
    });

    document.getElementById('play-btn').addEventListener('click', () => {
        if (!activePlayer) return;
        if (activePlayer.playing) {
            activePlayer.pause();
            updatePlaybackButtons();
        } else {
            activePlayer.play(() => updatePlaybackButtons());
            updatePlaybackButtons();
        }
    });

    // Timeline scrubber (spec §2.1) — dragging seeks the player directly to
    // that step index and pauses any active autoplay.
    const scrubber = document.getElementById('step-scrubber');
    if (scrubber) {
        scrubber.addEventListener('input', () => {
            if (!activePlayer) return;
            activePlayer.pause();
            activePlayer.seekTo(parseInt(scrubber.value, 10));
            updatePlaybackButtons();
        });
    }
}

// --- 3c. STRUCTURE MODE DOCK HELPERS (Stack/Queue/Tree — spec §2.2) ---

// Clear is destructive, so the first click swaps the button to "Confirm?"
// instead of clearing immediately; a second click (within 3s) actually
// clears. No modal — just an inline label swap — so this can't break the
// zero-scroll layout. Clicking elsewhere doesn't cancel it (no outside-click
// listener), but it auto-reverts after the timeout either way.
function wireClearConfirm(button, onConfirm) {
    if (!button) return;
    const originalLabel = button.innerText;
    let confirming = false;
    let revertTimer = null;

    button.addEventListener('click', () => {
        if (!confirming) {
            confirming = true;
            button.innerText = 'Confirm?';
            button.classList.add('confirm-pending');
            revertTimer = setTimeout(() => {
                confirming = false;
                button.innerText = originalLabel;
                button.classList.remove('confirm-pending');
            }, 3000);
        } else {
            clearTimeout(revertTimer);
            confirming = false;
            button.innerText = originalLabel;
            button.classList.remove('confirm-pending');
            onConfirm();
        }
    });
}

// Session history strip: a running log of actions taken during this
// Structure-mode session (Push 4 → Pop 4 → ...). Purely in-memory, reset
// every time a new workspace loads — spec leaves persistence undecided,
// and there's no backend to persist to anyway.
let sessionHistory = [];

function renderSessionHistory() {
    const strip = document.getElementById('session-history');
    if (!strip) return;

    if (sessionHistory.length === 0) {
        strip.innerHTML = '';
        strip.classList.add('hidden');
        return;
    }

    strip.classList.remove('hidden');
    strip.innerHTML = sessionHistory
        .map((action, i) => {
            const isLatest = i === sessionHistory.length - 1;
            return `<span class="session-chip${isLatest ? ' session-chip-latest' : ''}">${action}</span>`;
        })
        .join('<span class="session-arrow">\u2192</span>');

    strip.scrollLeft = strip.scrollWidth; // keep the newest entry in view
}

function logSessionAction(text) {
    sessionHistory.push(text);
    if (sessionHistory.length > 12) sessionHistory.shift(); // cap so the strip doesn't grow unbounded
    renderSessionHistory();
}

function resetSessionHistory() {
    sessionHistory = [];
    renderSessionHistory();
}

// --- 4. EVENT LISTENERS (ON LOAD) ---
document.addEventListener('DOMContentLoaded', () => {

    // Theory Drawer (spec §4.1) — persistent edge peek-tab opens a real
    // slide-in drawer (right rail on desktop, bottom sheet on mobile via
    // CSS breakpoint). Bound here: peek-tab, close button, scrim click,
    // and Escape. buildWorkspace() also force-closes this on every
    // workspace switch (see the reset block near the top of that function).
    const theoryPeekTab = document.getElementById('theory-peek-tab');
    const theoryDrawer = document.getElementById('theory-drawer');
    const theoryScrim = document.getElementById('theory-scrim');
    const theoryCloseBtn = document.getElementById('theory-close-btn');

    function openTheoryDrawer() {
        if (!theoryDrawer || !theoryScrim || !theoryPeekTab) return;
        theoryDrawer.classList.add('open');
        theoryScrim.classList.add('open');
        theoryDrawer.setAttribute('aria-hidden', 'false');
        theoryPeekTab.setAttribute('aria-expanded', 'true');
        theoryPeekTab.classList.add('hidden'); // avoid a redundant trigger while already open
    }

    function closeTheoryDrawer() {
        if (!theoryDrawer || !theoryScrim || !theoryPeekTab) return;
        theoryDrawer.classList.remove('open');
        theoryScrim.classList.remove('open');
        theoryDrawer.setAttribute('aria-hidden', 'true');
        theoryPeekTab.setAttribute('aria-expanded', 'false');
        theoryPeekTab.classList.remove('hidden');
    }

    if (theoryPeekTab) {
        theoryPeekTab.addEventListener('click', () => {
            const isOpen = theoryDrawer && theoryDrawer.classList.contains('open');
            if (isOpen) closeTheoryDrawer(); else openTheoryDrawer();
        });
    }
    if (theoryCloseBtn) theoryCloseBtn.addEventListener('click', closeTheoryDrawer);
    if (theoryScrim) theoryScrim.addEventListener('click', closeTheoryDrawer);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && theoryDrawer && theoryDrawer.classList.contains('open')) {
            closeTheoryDrawer();
        }
    });
    
    // Welcome Screen -> Dashboard
    const getStartedBtn = document.getElementById('get-started-btn');
    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', () => {
            showScreen('dashboard-screen');
            buildDashboard('array'); // Automatically load the first category
        });
    }

    // Keeps both the visual .active state and aria-selected in sync — used
    // by every place that changes which category is selected, so screen
    // readers always agree with what's visually highlighted.
    function setActiveCrumb(categoryId) {
        document.querySelectorAll('.dash-crumb').forEach(crumb => {
            const isMatch = crumb.getAttribute('data-target') === categoryId;
            crumb.classList.toggle('active', isMatch);
            crumb.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        });
    }

    // Hero quick-jump badges -> Dashboard, pre-filtered to that category
    document.querySelectorAll('.quick-jump-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
            const categoryId = e.currentTarget.getAttribute('data-target');
            if (!categoryId) return;
            showScreen('dashboard-screen');
            buildDashboard(categoryId);
            setActiveCrumb(categoryId);
        });
    });

    // Breadcrumb category switcher — real <button>s, so Enter/Space
    // activation comes for free (unlike the old <li role="button"> sidebar).
    document.querySelectorAll('.dash-crumb').forEach(crumb => {
        crumb.addEventListener('click', (e) => {
            const categoryId = e.currentTarget.getAttribute('data-target');
            if (!categoryId) return;
            setActiveCrumb(categoryId);
            buildDashboard(categoryId);
        });
    });

    // Type / Mode / Sort dropdowns — re-filter/re-sort in place, no need to
    // rebuild the cards themselves.
    const dashTypeFilter = document.getElementById('dash-type-filter');
    const dashModeFilter = document.getElementById('dash-mode-filter');
    const dashSortSelect = document.getElementById('dash-sort-select');
    [dashTypeFilter, dashModeFilter, dashSortSelect].forEach(select => {
        if (select) select.addEventListener('change', applyDashboardFilters);
    });

    // Home Logo -> Back to Dashboard (Default state)
    const homeLink = document.getElementById('home-link');
    if (homeLink) {
        homeLink.addEventListener('click', () => {
            showScreen('dashboard-screen');
            buildDashboard('array');
            setActiveCrumb('array');
        });
    }

    // Dashboard topbar Home button -> back to the hero/landing screen
    const dashHomeBtn = document.getElementById('dash-home-btn');
    if (dashHomeBtn) {
        dashHomeBtn.addEventListener('click', () => {
            showScreen('welcome-screen');
        });
    }

    // Code Panel Tabs
    const codeTabs = document.querySelectorAll('.tab-btn');

    codeTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            codeTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');

            const selectedLang = e.target.innerText;
            let dataKey = 'javascript'; 
            if (selectedLang === 'Python') dataKey = 'python';
            if (selectedLang === 'C++') dataKey = 'cpp'; 

            if (currentActiveCodes && currentActiveCodes[dataKey]) {
                renderCodeLines(currentActiveCodes[dataKey]);
            }

            // Code-line sync covers JS, Python, and C++ — re-check and either
            // show or clear the highlight for the newly active tab.
            refreshCodeHighlight();
        });
    });

    // Copy Button
    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const codeSnippet = document.getElementById('code-snippet');
            const textToCopy = codeSnippet.innerText;
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = "✅ Copied!";
                setTimeout(() => copyBtn.innerHTML = originalText, 2000);
            }).catch(() => {
                // Clipboard API can reject in insecure (non-HTTPS) contexts or
                // when permission is denied — fail visibly instead of leaving
                // an unhandled promise rejection with no user feedback.
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = "⚠️ Copy failed";
                setTimeout(() => copyBtn.innerHTML = originalText, 2000);
            });
        });
    }
});