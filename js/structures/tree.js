
// ==========================================
// TREE ENGINE (js/structures/tree.js) — Binary Search Tree
// ==========================================
// Same "live/persistent structure" pattern as stack.js/queue.js/graph.js —
// no generator/StepPlayer, direct async mutation with a busy guard against
// overlapping animated operations (treeBusy, mirroring graph.js's
// graphBusy). Node coordinates are computed fresh on every render: x from
// in-order index (guarantees left-smaller/right-larger ordering reads
// left-to-right with no edge crossovers, no external layout library
// needed), y from recursion depth — same approach the README describes.

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
 * Renders the tree as SVG. `comparing`/`found` are arrays of node VALUES
 * (not object refs — BST values are assumed unique), matching the
 * id-array convention graph.js uses for its comparing/found highlighting.
 */
export function renderTree({ comparing = [], found = [] } = {}) {
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
        const g = document.createElementNS(svgNS, 'g');
        g.classList.add('tree-node');
        if (comparing.includes(node.value)) g.classList.add('comparing');
        if (found.includes(node.value)) g.classList.add('found');

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', pos.px);
        circle.setAttribute('cy', pos.py);
        circle.setAttribute('r', 22);
        g.appendChild(circle);

        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', pos.px);
        text.setAttribute('y', pos.py);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.textContent = node.value;
        g.appendChild(text);

        svg.appendChild(g);
    });

    container.appendChild(svg);
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

export async function runTraversal(order) {
    if (!treeRoot) {
        const statusBar = document.getElementById('status-bar');
        statusBar.className = 'status-message error';
        statusBar.innerText = 'Tree is empty — nothing to traverse';
        return;
    }
    if (treeBusy) return;
    treeBusy = true;
    const myGeneration = workspaceGeneration;
    const statusBar = document.getElementById('status-bar');

    try {
        const orderedNodes = [];
        function collect(node) {
            if (!node) return;
            if (order === 'preorder') orderedNodes.push(node);
            collect(node.left);
            if (order === 'inorder') orderedNodes.push(node);
            collect(node.right);
            if (order === 'postorder') orderedNodes.push(node);
        }
        collect(treeRoot);

        const label = order.charAt(0).toUpperCase() + order.slice(1);
        const visited = [];
        for (const node of orderedNodes) {
            renderTree({ comparing: [node.value], found: [...visited] });
            statusBar.className = 'status-message searching';
            statusBar.innerText = `${label} traversal: ${visited.concat(node.value).join(' \u2192 ')}`;
            await sleep(getSpeed());
            if (myGeneration !== workspaceGeneration) return;
            visited.push(node.value);
        }

        renderTree({ found: visited });
        statusBar.className = 'status-message success';
        statusBar.innerText = `${label} traversal complete: ${visited.join(' \u2192 ')}`;
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
}
