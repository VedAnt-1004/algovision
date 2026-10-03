
// ==========================================
// TREE ENGINE (js/structures/tree.js) — Binary Search Tree + AVL Tree
// ==========================================
// Same "live/persistent structure" pattern as stack.js/queue.js/graph.js —
// direct async mutation with a busy guard against overlapping animated
// operations (treeBusy, mirroring the other structure engines). Node
// coordinates are computed fresh on every render: x from in-order index
// (guarantees left-smaller/right-larger ordering reads left-to-right with
// no edge crossovers, no external layout library needed), y from recursion
// depth — same approach the README describes.
//
// PERSISTENT RENDERING: renderTree() no longer wipes the container. The
// <svg> persists, and every node / edge is bound to a stable DOM element by
// id (tree-node-<value>, tree-edge-<parent>-<child>) using an
// enter / update / exit pattern:
//   enter  → new data gets a new element (fades in)
//   update → existing elements are moved to their new layout coordinates
//            (nodes via a CSS transform transition, edges + viewBox via a
//            small rAF tween that uses the same duration and easing) so a
//            rotation reads as nodes gliding instead of the tree teleporting
//   exit   → elements whose data disappeared are removed
// Why transform and not cx/cy: an SVG node is a circle PLUS a text label (and
// optional badges). cx / cy / x / y / x1.. are attributes, not transitionable
// CSS properties in every browser, and the label would lag behind its circle.
// Each node is therefore a <g> positioned with a CSS transform, with its
// children drawn around (0, 0).
//
// TRAVERSALS: inorderSteps / preorderSteps / postorderSteps are PURE
// function* generators (no DOM, no timers, no app.js state) that yield
// discrete step snapshots — same contract as js/algorithms/*.js:
//   { phase, message, statusClass, highlights: { comparing, current, found, order } }
// app.js imports them, drives the for...of loop, and owns all UI and
// code-panel updates (phase → lineMap line in data.js).
//
// AVL: avlInsertSteps(value) is a function* generator that follows the same
// step contract but MUTATES the live treeRoot (it lives here, next to the
// state it rotates, and imports nothing UI-related). Every yield happens at a
// moment when treeRoot is a valid, fully linked tree, so renderTree() can draw
// any step. AVL nodes carry a `height`; plain BST nodes (createTreeNode) do not.
//
// Highlight semantics (all values are node VALUES; BST values are unique):
//   comparing → amber  : node currently being processed
//   found     → green  : node already visited
//   current   → blue   : ancestor still open on the recursion stack / pivot
//   order     → small numbered badge showing visit order
//   labels    → { [value]: { height, balance } } small "h= bf=" caption under
//               a node. Omitted (null) → AVL nodes are auto-labelled from their
//               stored height; BST nodes get no caption.
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

// ==========================================
// RENDERING (persistent SVG: enter / update / exit)
// ==========================================

const SVG_NS = 'http://www.w3.org/2000/svg';
const TREE_MOVE_MS_MAX = 500;

// easeInOutCubic — identical to the CSS cubic-bezier(0.65, 0, 0.35, 1) used
// for the node transitions in style.css, so tweened edges and CSS-transitioned
// nodes stay in lockstep.
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// How long a layout move takes: never longer than one animation step
// (getSpeed()), capped at 500ms, and instant when the user prefers reduced
// motion. Written to the svg as --tree-move-ms so style.css picks it up.
function getTreeMoveMs() {
    const reduced = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return 0;
    return Math.max(0, Math.min(TREE_MOVE_MS_MAX, getSpeed()));
}

// Tweens an array of numbers from `from` to `to` and hands each frame to
// apply(values). Retargeting mid-flight is safe: the new tween starts from
// whatever the previous one last applied (callers read `from` back from the
// element's current attributes) and the old frame loop is cancelled.
function tweenNumbers(owner, from, to, ms, apply) {
    if (owner._treeTween && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(owner._treeTween);
    owner._treeTween = null;

    const unchanged = from.every((v, i) => v === to[i]);
    if (unchanged || ms <= 0 || typeof requestAnimationFrame !== 'function') {
        apply(to);
        return;
    }

    const start = performance.now();
    const tick = () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        if (t >= 1) {
            apply(to);
            owner._treeTween = null;
            return;
        }
        const eased = easeInOutCubic(t);
        apply(from.map((v, i) => v + (to[i] - v) * eased));
        owner._treeTween = requestAnimationFrame(tick);
    };
    owner._treeTween = requestAnimationFrame(tick);
}

// Fades a freshly entered element in (opacity is covered by the
// `transition: all` rules in style.css). The forced reflow makes the browser
// commit opacity:0 as the "before" style so the change below actually animates.
function fadeIn(el, ms) {
    if (ms <= 0 || typeof el.getBoundingClientRect !== 'function') return;
    el.style.opacity = '0';
    void el.getBoundingClientRect();
    el.style.opacity = '';
}

function readNumberAttributes(el, names, fallback) {
    return names.map((name, i) => {
        const parsed = parseFloat(el.getAttribute(name));
        return Number.isFinite(parsed) ? parsed : fallback[i];
    });
}

function formatBalance(balance) {
    return balance > 0 ? `+${balance}` : String(balance);
}

/**
 * Renders the tree as persistent SVG. `comparing`/`current`/`found` are
 * arrays of node VALUES (not object refs — BST values are assumed unique),
 * matching the id-array convention graph.js uses. `order` is an array of
 * values in visit order; each gets a small numbered badge. `labels` is an
 * optional { [value]: { height, balance } } map (see header). Non-color cues:
 * the amber node is drawn slightly larger, visited nodes carry an order badge,
 * an unbalanced AVL caption is drawn in the accent color.
 */
export function renderTree({ comparing = [], current = [], found = [], order = [], labels = null } = {}) {
    const container = document.getElementById('visualizer-container');
    if (!container) return;

    container.classList.remove('stack-mode', 'queue-mode', 'graph-mode');
    container.classList.add('tree-mode');

    if (!treeRoot) {
        container.innerHTML = '';
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

    const moveMs = getTreeMoveMs();
    const orderIndex = new Map(order.map((value, i) => [value, i + 1]));

    // --- the persistent <svg> (rebuilt only if the container holds something else) ---
    let svg = container.children.length === 1 && container.firstElementChild.classList.contains('tree-svg')
        ? container.firstElementChild
        : null;

    if (!svg) {
        container.innerHTML = '';
        svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.classList.add('tree-svg');

        const edgeLayer = document.createElementNS(SVG_NS, 'g'); // edges first so node circles render on top
        edgeLayer.classList.add('tree-edges');
        const nodeLayer = document.createElementNS(SVG_NS, 'g');
        nodeLayer.classList.add('tree-nodes');
        svg.appendChild(edgeLayer);
        svg.appendChild(nodeLayer);
        container.appendChild(svg);
    } else {
        // The layout grew or shrank: glide the viewBox too, otherwise every node
        // would visibly rescale in one frame while it is also sliding.
        const parts = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
        const from = parts.length === 4 && parts.every(Number.isFinite) ? parts : [0, 0, width, height];
        tweenNumbers(svg, from, [0, 0, width, height], moveMs, (v) => {
            svg.setAttribute('viewBox', v.map(n => Math.round(n * 100) / 100).join(' '));
        });
    }
    svg.style.setProperty('--tree-move-ms', `${moveMs}ms`);

    const edgeLayer = svg.querySelector('.tree-edges');
    const nodeLayer = svg.querySelector('.tree-nodes');

    const existingEdges = new Map();
    edgeLayer.querySelectorAll('.tree-edge').forEach(el => existingEdges.set(el.id, el));
    const existingNodes = new Map();
    nodeLayer.querySelectorAll('.tree-node').forEach(el => existingNodes.set(el.id, el));

    // --- edges: enter / update / exit ---
    const edgeAttrs = ['x1', 'y1', 'x2', 'y2'];
    const wantedEdgeIds = new Set();

    positions.forEach((pos, node) => {
        [node.left, node.right].forEach(child => {
            if (!child) return;
            const childPos = positions.get(child);
            const id = `tree-edge-${node.value}-${child.value}`;
            const target = [pos.px, pos.py, childPos.px, childPos.py];
            wantedEdgeIds.add(id);

            let line = existingEdges.get(id);
            if (!line) {
                line = document.createElementNS(SVG_NS, 'line');
                line.id = id;
                line.classList.add('tree-edge');
                edgeAttrs.forEach((name, i) => line.setAttribute(name, target[i]));
                edgeLayer.appendChild(line);
                fadeIn(line, moveMs);
            } else {
                const from = readNumberAttributes(line, edgeAttrs, target);
                tweenNumbers(line, from, target, moveMs, (v) => {
                    edgeAttrs.forEach((name, i) => line.setAttribute(name, v[i]));
                });
            }
        });
    });

    existingEdges.forEach((line, id) => {
        if (!wantedEdgeIds.has(id)) line.remove();
    });

    // --- nodes: enter / update / exit ---
    const wantedNodeIds = new Set();

    positions.forEach((pos, node) => {
        const value = node.value;
        const id = `tree-node-${value}`;
        wantedNodeIds.add(id);

        const isComparing = comparing.includes(value);
        const isFound = !isComparing && found.includes(value);
        const isCurrent = !isComparing && !isFound && current.includes(value);

        let g = existingNodes.get(id);
        const entering = !g;

        if (entering) {
            g = document.createElementNS(SVG_NS, 'g');
            g.id = id;
            g.classList.add('tree-node');

            const circle = document.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('cx', 0);
            circle.setAttribute('cy', 0);
            g.appendChild(circle);

            const text = document.createElementNS(SVG_NS, 'text');
            text.setAttribute('x', 0);
            text.setAttribute('y', 0);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'central');
            g.appendChild(text);
        }

        // Position BEFORE the element is attached (when entering) so a new node
        // appears in place instead of transitioning in from the origin. For an
        // existing node this change is exactly what the CSS transition animates.
        g.setAttribute('transform', `translate(${pos.px} ${pos.py})`); // fallback / non-CSS renderers
        g.style.transform = `translate(${pos.px}px, ${pos.py}px)`;

        g.classList.toggle('comparing', isComparing);
        g.classList.toggle('found', isFound);
        g.classList.toggle('current', isCurrent);

        const circle = g.querySelector('circle');
        circle.setAttribute('r', isComparing ? 26 : 22);
        if (isCurrent) {
            // No .tree-node.current rule exists in style.css, so the blue
            // "on the recursion stack / pivot" state is applied inline via the
            // locked --state-blue token.
            circle.style.fill = 'var(--state-blue)';
            circle.style.stroke = 'var(--state-blue)';
        } else {
            circle.style.fill = '';
            circle.style.stroke = '';
        }

        g.querySelector('text').textContent = value;

        // Visit-order badge (traversals)
        let badge = g.querySelector('.tree-order-badge');
        let badgeText = g.querySelector('.tree-order-badge-text');
        if (orderIndex.has(value)) {
            if (!badge) {
                badge = document.createElementNS(SVG_NS, 'circle');
                badge.classList.add('tree-order-badge');
                badge.setAttribute('cx', 18);
                badge.setAttribute('cy', -18);
                badge.setAttribute('r', 10);
                badge.style.fill = 'var(--panel-dark)';
                badge.style.stroke = 'white';
                badge.style.strokeWidth = '1.5';
                g.appendChild(badge);

                badgeText = document.createElementNS(SVG_NS, 'text');
                badgeText.classList.add('tree-order-badge-text');
                badgeText.setAttribute('x', 18);
                badgeText.setAttribute('y', -18);
                badgeText.setAttribute('text-anchor', 'middle');
                badgeText.setAttribute('dominant-baseline', 'central');
                badgeText.style.fontSize = '11px';
                badgeText.style.fill = 'white';
                g.appendChild(badgeText);
            }
            badgeText.textContent = orderIndex.get(value);
        } else {
            if (badge) badge.remove();
            if (badgeText) badgeText.remove();
        }

        // AVL caption: height + balance factor under the node
        let info = null;
        if (labels !== null) {
            info = labels[value] || null;
        } else if (typeof node.height === 'number') {
            info = { height: node.height, balance: avlHeight(node.left) - avlHeight(node.right) };
        }

        let captionEl = g.querySelector('.tree-node-label');
        if (info) {
            if (!captionEl) {
                captionEl = document.createElementNS(SVG_NS, 'text');
                captionEl.classList.add('tree-node-label');
                captionEl.setAttribute('x', 0);
                captionEl.setAttribute('y', 38);
                captionEl.setAttribute('text-anchor', 'middle');
                captionEl.setAttribute('dominant-baseline', 'central');
                g.appendChild(captionEl);
            }
            captionEl.textContent = `h=${info.height} bf=${formatBalance(info.balance)}`;
            captionEl.classList.toggle('imbalanced', Math.abs(info.balance) > 1);
        } else if (captionEl) {
            captionEl.remove();
        }

        if (entering) {
            nodeLayer.appendChild(g);
            fadeIn(g, moveMs);
        }
    });

    existingNodes.forEach((g, id) => {
        if (!wantedNodeIds.has(id)) g.remove();
    });
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
// AVL TREE (self-balancing insertion)
// ==========================================
// AVL nodes are { value, left, right, height } — height is the number of
// nodes on the longest path down to a leaf (a leaf is 1, null is 0). The
// balance factor of a node is height(left) − height(right); the AVL invariant
// is |balance| <= 1 everywhere, restored after an insert with one of four
// rotations: LL (rotate right), RR (rotate left), LR (rotate left, then
// right), RL (rotate right, then left).

export function createAvlNode(value) {
    return { value, left: null, right: null, height: 1 };
}

function avlHeight(node) {
    return node ? node.height : 0;
}

export function avlBalanceFactor(node) {
    return node ? avlHeight(node.left) - avlHeight(node.right) : 0;
}

function avlRecalculateHeight(node) {
    node.height = 1 + Math.max(avlHeight(node.left), avlHeight(node.right));
}

function avlRotateRight(y) {
    const x = y.left;
    y.left = x.right;
    x.right = y;
    avlRecalculateHeight(y);
    avlRecalculateHeight(x);
    return x;
}

function avlRotateLeft(x) {
    const y = x.right;
    x.right = y.left;
    y.left = x;
    avlRecalculateHeight(x);
    avlRecalculateHeight(y);
    return y;
}

// { [value]: { height, balance } } for every node except those in `hidden`
// (ancestors whose height has not been recomputed yet — their stored height
// is stale mid-insert, so the caption appears only once it is trustworthy).
function collectAvlLabels(root, hidden) {
    const labels = {};
    (function walk(node) {
        if (!node) return;
        if (!hidden.has(node.value)) {
            labels[node.value] = { height: node.height, balance: avlHeight(node.left) - avlHeight(node.right) };
        }
        walk(node.left);
        walk(node.right);
    })(root);
    return labels;
}

/**
 * AVL insertion as a step generator. Mutates the live `treeRoot` (which must
 * be empty or made of AVL nodes). Iterative on purpose: it records the path
 * down, then unwinds it bottom-up, and every rotation is re-linked into the
 * parent (or treeRoot) BEFORE the next yield, so each yielded state is a
 * complete, drawable tree.
 *
 * Phases: start, compare, duplicate, insert, update-height, balance,
 *         rotate-ll, rotate-rr, rotate-lr-left, rotate-lr-right,
 *         rotate-rl-right, rotate-rl-left, done
 */
export function* avlInsertSteps(value) {
    const pending = new Set(); // path nodes whose height is not yet recomputed
    const snap = (comparing = [], current = [], found = []) => ({
        comparing,
        current,
        found,
        order: [],
        labels: collectAvlLabels(treeRoot, pending)
    });

    yield {
        phase: 'start',
        message: treeRoot ? `Insert ${value}: start at the root` : `Insert ${value}: the tree is empty`,
        statusClass: 'searching',
        highlights: snap()
    };

    if (!treeRoot) {
        treeRoot = createAvlNode(value);
        yield { phase: 'insert', message: `${value} becomes the root`, statusClass: 'searching', highlights: snap([value]) };
        yield { phase: 'done', message: `Inserted ${value}; the tree is balanced`, statusClass: 'success', highlights: snap([], [], [value]) };
        return;
    }

    // --- 1. walk down, comparing, until an empty slot is found ---
    const path = []; // [{ node, dir }] — dir is the pointer taken out of `node`
    let node = treeRoot;

    for (;;) {
        if (value === node.value) {
            yield {
                phase: 'duplicate',
                message: `${value} already exists — AVL trees keep values unique`,
                statusClass: 'error',
                highlights: snap([node.value], path.map(p => p.node.value))
            };
            return;
        }

        const dir = value < node.value ? 'left' : 'right';
        yield {
            phase: 'compare',
            message: `Comparing ${value} with ${node.value}: ${value} is ${dir === 'left' ? 'smaller' : 'larger'} \u2192 go ${dir}`,
            statusClass: 'searching',
            highlights: snap([node.value], path.map(p => p.node.value))
        };

        path.push({ node, dir });
        const next = node[dir];
        if (!next) {
            node[dir] = createAvlNode(value);
            break;
        }
        node = next;
    }

    path.forEach(entry => pending.add(entry.node.value));
    const lastEntry = path[path.length - 1];

    yield {
        phase: 'insert',
        message: `Insert ${value} as the ${lastEntry.dir} child of ${lastEntry.node.value}`,
        statusClass: 'searching',
        highlights: snap([value], path.map(p => p.node.value))
    };

    // --- 2. unwind bottom-up: update heights, check balance, rotate ---
    for (let i = path.length - 1; i >= 0; i--) {
        const n = path[i].node;
        const parentEntry = i > 0 ? path[i - 1] : null;
        const relink = (newSubtreeRoot) => {
            if (parentEntry) parentEntry.node[parentEntry.dir] = newSubtreeRoot;
            else treeRoot = newSubtreeRoot;
        };

        avlRecalculateHeight(n);
        pending.delete(n.value);
        const lh = avlHeight(n.left);
        const rh = avlHeight(n.right);

        yield {
            phase: 'update-height',
            message: `Update height of ${n.value}: 1 + max(${lh}, ${rh}) = ${n.height}`,
            statusClass: 'searching',
            highlights: snap([n.value], [...pending])
        };

        const balance = lh - rh;
        if (Math.abs(balance) <= 1) {
            yield {
                phase: 'balance',
                message: `Balance factor of ${n.value} = ${lh} \u2212 ${rh} = ${formatBalance(balance)} \u2192 balanced`,
                statusClass: 'searching',
                highlights: snap([n.value], [...pending])
            };
            continue;
        }

        // Unbalanced: classify by where the new value went relative to the heavy child.
        const leftHeavy = balance > 1;
        const heavyChild = leftHeavy ? n.left : n.right;
        const caseName = leftHeavy
            ? (value < n.left.value ? 'LL' : 'LR')
            : (value > n.right.value ? 'RR' : 'RL');

        yield {
            phase: 'balance',
            message: `Balance factor of ${n.value} = ${lh} \u2212 ${rh} = ${formatBalance(balance)} \u2192 unbalanced (${caseName} case)`,
            statusClass: 'error',
            highlights: snap([n.value], [heavyChild.value])
        };

        if (caseName === 'LL') {
            const newRoot = avlRotateRight(n);
            relink(newRoot);
            yield {
                phase: 'rotate-ll',
                message: `Left-Left case: rotate right at ${n.value} \u2014 ${newRoot.value} becomes the subtree root`,
                statusClass: 'searching',
                highlights: snap([newRoot.value], [n.value])
            };
        } else if (caseName === 'RR') {
            const newRoot = avlRotateLeft(n);
            relink(newRoot);
            yield {
                phase: 'rotate-rr',
                message: `Right-Right case: rotate left at ${n.value} \u2014 ${newRoot.value} becomes the subtree root`,
                statusClass: 'searching',
                highlights: snap([newRoot.value], [n.value])
            };
        } else if (caseName === 'LR') {
            const oldChild = n.left;
            n.left = avlRotateLeft(oldChild);
            yield {
                phase: 'rotate-lr-left',
                message: `Left-Right case, step 1: rotate left at ${oldChild.value} \u2014 ${n.left.value} moves up`,
                statusClass: 'searching',
                highlights: snap([n.left.value], [n.value])
            };
            const newRoot = avlRotateRight(n);
            relink(newRoot);
            yield {
                phase: 'rotate-lr-right',
                message: `Left-Right case, step 2: rotate right at ${n.value} \u2014 ${newRoot.value} becomes the subtree root`,
                statusClass: 'searching',
                highlights: snap([newRoot.value], [n.value])
            };
        } else {
            const oldChild = n.right;
            n.right = avlRotateRight(oldChild);
            yield {
                phase: 'rotate-rl-right',
                message: `Right-Left case, step 1: rotate right at ${oldChild.value} \u2014 ${n.right.value} moves up`,
                statusClass: 'searching',
                highlights: snap([n.right.value], [n.value])
            };
            const newRoot = avlRotateLeft(n);
            relink(newRoot);
            yield {
                phase: 'rotate-rl-left',
                message: `Right-Left case, step 2: rotate left at ${n.value} \u2014 ${newRoot.value} becomes the subtree root`,
                statusClass: 'searching',
                highlights: snap([newRoot.value], [n.value])
            };
        }
    }

    yield {
        phase: 'done',
        message: `Inserted ${value}; the tree is balanced`,
        statusClass: 'success',
        highlights: snap([], [], [value])
    };
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
