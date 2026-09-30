
// ==========================================
// TREE ENGINE (js/structures/tree.js) — Binary Search Tree
// ==========================================
// Same "live/persistent structure" pattern as stack.js/queue.js/graph.js —
// direct async mutation with a busy guard against overlapping animated
// operations (treeBusy, mirroring the other structure engines). Node
// coordinates are computed fresh on every render: x from in-order index
// (guarantees left-smaller/right-larger ordering reads left-to-right with
// no edge crossovers, no external layout library needed), y from recursion
// depth — same approach the README describes.
//
// TRAVERSALS: inorderSteps / preorderSteps / postorderSteps are PURE
// function* generators (no DOM, no timers, no app.js state) that yield
// discrete step snapshots — same contract as js/algorithms/*.js:
//   { phase, message, statusClass, highlights: { comparing, current, found, order } }
// app.js imports them, drives the for...of loop, and owns all UI and
// code-panel updates (phase → lineMap line in data.js).
//
// Highlight semantics (all values are node VALUES; BST values are unique):
//   comparing → amber  : node currently being processed
//   found     → green  : node already visited
//   current   → blue   : ancestor still open on the recursion stack
//   order     → small numbered badge showing visit order
// Precedence when a value is in several lists: comparing > found > current.

import { sleep, getSpeed, workspaceGeneration, bumpWorkspaceGeneration } from '../visualizer.js';

export let treeRoot = null;
let treeBusy = false;

export function createTreeNode(value) {
    return { value, left: null, right: null };
}

export function insertIntoTree(root, value) {
    if (!root) return createTreeNode(value);
    if (value === root.value) return root; // no duplicates
    if (value < root.value) root.left = insertIntoTree(root.left, value);
    else root.right = insertIntoTree(root.right, value);
    return root;
}

export function findMinNode(root) {
    let current = root;
    while (current.left) current = current.left;
    return current;
}

// Classic 3-case BST delete: leaf, one child, two children (replace with
// in-order successor — the minimum of the right subtree).
export function deleteFromTree(root, value) {
    if (!root) return null;
    if (value < root.value) {
        root.left = deleteFromTree(root.left, value);
    } else if (value > root.value) {
        root.right = deleteFromTree(root.right, value);
    } else {
        if (!root.left && !root.right) return null;
        if (!root.left) return root.right;
        if (!root.right) return root.left;
        const successor = findMinNode(root.right);
        root.value = successor.value;
        root.right = deleteFromTree(root.right, successor.value);
    }
    return root;
}

/**
 * Renders the tree as SVG. `comparing`/`current`/`found` are arrays of node
 * VALUES (not object refs — BST values are assumed unique), matching the
 * id-array convention graph.js uses. `order` is an array of values in visit
 * order; each gets a small numbered badge. Non-color cues: the amber node is
 * drawn slightly larger, visited nodes carry an order badge.
 */
export function renderTree({ comparing = [], current = [], found = [], order = [] } = {}) {
    const container = document.getElementById('visualizer-container');
    if (!container) return;

    container.classList.remove('stack-mode', 'queue-mode', 'graph-mode');
    container.classList.add('tree-mode');
    container.innerHTML = '';

    if (!treeRoot) {
        const empty = document.createElement('div');
        empty.classList.add('empty-structure-msg');
        empty.innerText = 'Tree is empty — insert a value to begin';
        container.appendChild(empty);
        return;
    }

    // In-order traversal assigns x (left-to-right sorted position);
    // recursion depth assigns y.
    const positions = new Map(); // node -> { x, y, px, py }
    let inOrderCounter = 0;
    let maxDepth = 0;

    function assignPositions(node, depth) {
        if (!node) return;
        assignPositions(node.left, depth + 1);
        positions.set(node, { x: inOrderCounter, y: depth });
        inOrderCounter++;
        maxDepth = Math.max(maxDepth, depth);
        assignPositions(node.right, depth + 1);
    }
    assignPositions(treeRoot, 0);

    const hSpacing = 64;
    const vSpacing = 76;
    const padding = 44;
    const width = inOrderCounter * hSpacing + padding * 2;
    const height = (maxDepth + 1) * vSpacing + padding * 2;

    positions.forEach(pos => {
        pos.px = padding + pos.x * hSpacing + hSpacing / 2;
        pos.py = padding + pos.y * vSpacing + vSpacing / 2;
    });

    const orderIndex = new Map(order.map((value, i) => [value, i + 1]));

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.classList.add('tree-svg');

    // Edges first so node circles render on top of the lines
    positions.forEach((pos, node) => {
        [node.left, node.right].forEach(child => {
            if (!child) return;
            const childPos = positions.get(child);
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', pos.px);
            line.setAttribute('y1', pos.py);
            line.setAttribute('x2', childPos.px);
            line.setAttribute('y2', childPos.py);
            line.classList.add('tree-edge');
            svg.appendChild(line);
        });
    });

    positions.forEach((pos, node) => {
        const value = node.value;
        const isComparing = comparing.includes(value);
        const isFound = !isComparing && found.includes(value);
        const isCurrent = !isComparing && !isFound && current.includes(value);

        const g = document.createElementNS(svgNS, 'g');
        g.classList.add('tree-node');
        if (isComparing) g.classList.add('comparing');
        if (isFound) g.classList.add('found');
        if (isCurrent) g.classList.add('current');

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', pos.px);
        circle.setAttribute('cy', pos.py);
        circle.setAttribute('r', isComparing ? 26 : 22);
        if (isCurrent) {
            // No .tree-node.current rule exists in style.css, so the blue
            // "on the recursion stack" state is applied inline via the
            // locked --state-blue token.
            circle.style.fill = 'var(--state-blue)';
            circle.style.stroke = 'var(--state-blue)';
        }
        g.appendChild(circle);

        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', pos.px);
        text.setAttribute('y', pos.py);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.textContent = value;
        g.appendChild(text);

        if (orderIndex.has(value)) {
            const badge = document.createElementNS(svgNS, 'circle');
            badge.setAttribute('cx', pos.px + 18);
            badge.setAttribute('cy', pos.py - 18);
            badge.setAttribute('r', 10);
            badge.style.fill = 'var(--panel-dark)';
            badge.style.stroke = 'white';
            badge.style.strokeWidth = '1.5';
            g.appendChild(badge);

            const badgeText = document.createElementNS(svgNS, 'text');
            badgeText.setAttribute('x', pos.px + 18);
            badgeText.setAttribute('y', pos.py - 18);
            badgeText.setAttribute('text-anchor', 'middle');
            badgeText.setAttribute('dominant-baseline', 'central');
            badgeText.style.fontSize = '11px';
            badgeText.style.fill = 'white';
            badgeText.textContent = orderIndex.get(value);
            g.appendChild(badgeText);
        }

        svg.appendChild(g);
    });

    container.appendChild(svg);
}

// True while an animated insert/search/delete is in flight. app.js checks
// this before starting a traversal so the two never render over each other.
export function isTreeBusy() {
    return treeBusy;
}

export async function insertNode(value) {
    if (treeBusy) return;
    treeBusy = true;
    const myGeneration = workspaceGeneration;
    const statusBar = document.getElementById('status-bar');

    try {
        // Walk down showing the comparison path before actually inserting,
        // matching search's "visit and compare" visual language.
        let current = treeRoot;
        while (current) {
            renderTree({ comparing: [current.value] });
            statusBar.className = 'status-message searching';
            statusBar.innerText = `Comparing ${value} with ${current.value}...`;
            await sleep(getSpeed());
            if (myGeneration !== workspaceGeneration) return; // navigated away mid-animation

            if (value === current.value) {
                statusBar.className = 'status-message error';
                statusBar.innerText = `${value} already exists in the tree`;
                renderTree();
                return;
            }
            current = value < current.value ? current.left : current.right;
        }

        treeRoot = insertIntoTree(treeRoot, value);
        renderTree({ found: [value] });
        statusBar.className = 'status-message success';
        statusBar.innerText = `Inserted ${value}`;
    } finally {
        treeBusy = false;
    }
}

export async function searchTree(value) {
    if (treeBusy) return;
    treeBusy = true;
    const myGeneration = workspaceGeneration;
    const statusBar = document.getElementById('status-bar');

    try {
        let current = treeRoot;
        while (current) {
            renderTree({ comparing: [current.value] });
            statusBar.className = 'status-message searching';
            statusBar.innerText = `Checking ${current.value}...`;
            await sleep(getSpeed());
            if (myGeneration !== workspaceGeneration) return;

            if (value === current.value) {
                renderTree({ found: [value] });
                statusBar.className = 'status-message success';
                statusBar.innerText = `Found ${value}!`;
                return;
            }
            current = value < current.value ? current.left : current.right;
        }

        renderTree();
        statusBar.className = 'status-message error';
        statusBar.innerText = `${value} not found in the tree`;
    } finally {
        treeBusy = false;
    }
}

export async function deleteNode(value) {
    if (treeBusy) return;
    treeBusy = true;
    const myGeneration = workspaceGeneration;
    const statusBar = document.getElementById('status-bar');

    try {
        // Confirm it exists first, with the same visual walk as search
        let current = treeRoot;
        let exists = false;
        while (current) {
            renderTree({ comparing: [current.value] });
            statusBar.className = 'status-message searching';
            statusBar.innerText = `Looking for ${value} to delete...`;
            await sleep(getSpeed());
            if (myGeneration !== workspaceGeneration) return;
            if (value === current.value) { exists = true; break; }
            current = value < current.value ? current.left : current.right;
        }

        if (!exists) {
            renderTree();
            statusBar.className = 'status-message error';
            statusBar.innerText = `${value} not found — nothing to delete`;
            return;
        }

        treeRoot = deleteFromTree(treeRoot, value);
        renderTree();
        statusBar.className = 'status-message success';
        statusBar.innerText = `Deleted ${value}`;
    } finally {
        treeBusy = false;
    }
}

export function clearTree() {
    bumpWorkspaceGeneration(); // orphan any pending animation so it can't resurrect after this clear
    treeRoot = null;
    treeBusy = false;
    renderTree();
    const statusBar = document.getElementById('status-bar');
    if (statusBar) statusBar.className = 'status-message hidden';
}

// Resets state without rendering. ES module imports are read-only, so
// app.js can't do `treeRoot = null` itself when it builds a workspace.
export function resetTree() {
    treeRoot = null;
    treeBusy = false;
}

// ==========================================
// TRAVERSAL GENERATORS (pure — no DOM, no timers, no app.js state)
// ==========================================
// Shared bookkeeping: `stack` mirrors the open recursion frames (node
// values), `visited` is the output order so far. snap(active) builds a fresh
// highlight snapshot (arrays are copied so a consumer may safely cache steps).

function createTreeTraversalContext() {
    const stack = [];
    const visited = [];
    const snap = (active = null) => ({
        comparing: active === null ? [] : [active],
        current: stack.filter(v => v !== active),
        found: [...visited],
        order: [...visited]
    });
    return { stack, visited, snap };
}

function makeTreeStartStep(ctx, label, root) {
    return {
        phase: 'start',
        message: root ? `Starting ${label} traversal at root ${root.value}` : `Starting ${label} traversal`,
        statusClass: 'searching',
        highlights: ctx.snap()
    };
}

function makeTreeNullStep(ctx, parent, side) {
    return {
        phase: 'null-child',
        message: parent === null ? 'The tree is empty — nothing to traverse' : `${parent} has no ${side} child — return`,
        statusClass: 'searching',
        highlights: ctx.snap(parent)
    };
}

// Records the visit (mutates ctx.visited) and returns the matching step.
function makeTreeVisitStep(ctx, label, value) {
    ctx.visited.push(value);
    return {
        phase: 'visit',
        message: `Visit ${value}. ${label} so far: ${ctx.visited.join(' \u2192 ')}`,
        statusClass: 'searching',
        highlights: ctx.snap(value)
    };
}

function makeTreeDoneStep(ctx, label) {
    return {
        phase: 'done',
        message: `${label} traversal complete: ${ctx.visited.join(' \u2192 ')}`,
        statusClass: 'success',
        highlights: { comparing: [], current: [], found: [...ctx.visited], order: [...ctx.visited] }
    };
}

// Phases: start, null-child, go-left, visit, go-right, done
export function* inorderSteps(root) {
    const ctx = createTreeTraversalContext();
    const label = 'In-Order';

    yield makeTreeStartStep(ctx, label, root);

    function* walk(node, parent, side) {
        if (node === null) {
            yield makeTreeNullStep(ctx, parent, side);
            return;
        }
        const v = node.value;
        ctx.stack.push(v);

        yield { phase: 'go-left', message: `At ${v}: traverse the left subtree first`, statusClass: 'searching', highlights: ctx.snap(v) };
        yield* walk(node.left, v, 'left');

        yield makeTreeVisitStep(ctx, label, v);

        yield { phase: 'go-right', message: `Back at ${v}: traverse the right subtree`, statusClass: 'searching', highlights: ctx.snap(v) };
        yield* walk(node.right, v, 'right');

        ctx.stack.pop();
    }

    yield* walk(root, null, null);
    yield makeTreeDoneStep(ctx, label);
}

// Phases: start, null-child, visit, go-left, go-right, done
export function* preorderSteps(root) {
    const ctx = createTreeTraversalContext();
    const label = 'Pre-Order';

    yield makeTreeStartStep(ctx, label, root);

    function* walk(node, parent, side) {
        if (node === null) {
            yield makeTreeNullStep(ctx, parent, side);
            return;
        }
        const v = node.value;
        ctx.stack.push(v);

        yield makeTreeVisitStep(ctx, label, v);

        yield { phase: 'go-left', message: `At ${v}: traverse the left subtree`, statusClass: 'searching', highlights: ctx.snap(v) };
        yield* walk(node.left, v, 'left');

        yield { phase: 'go-right', message: `Back at ${v}: traverse the right subtree`, statusClass: 'searching', highlights: ctx.snap(v) };
        yield* walk(node.right, v, 'right');

        ctx.stack.pop();
    }

    yield* walk(root, null, null);
    yield makeTreeDoneStep(ctx, label);
}

// Phases: start, null-child, go-left, go-right, visit, done
export function* postorderSteps(root) {
    const ctx = createTreeTraversalContext();
    const label = 'Post-Order';

    yield makeTreeStartStep(ctx, label, root);

    function* walk(node, parent, side) {
        if (node === null) {
            yield makeTreeNullStep(ctx, parent, side);
            return;
        }
        const v = node.value;
        ctx.stack.push(v);

        yield { phase: 'go-left', message: `At ${v}: traverse the left subtree first`, statusClass: 'searching', highlights: ctx.snap(v) };
        yield* walk(node.left, v, 'left');

        yield { phase: 'go-right', message: `Back at ${v}: traverse the right subtree next`, statusClass: 'searching', highlights: ctx.snap(v) };
        yield* walk(node.right, v, 'right');

        yield makeTreeVisitStep(ctx, label, v);

        ctx.stack.pop();
    }

    yield* walk(root, null, null);
    yield makeTreeDoneStep(ctx, label);
}
