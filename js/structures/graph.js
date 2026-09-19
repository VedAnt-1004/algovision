
// ==========================================
// GRAPH ENGINE (js/structures/graph.js)
// ==========================================
// Same "live/persistent structure" pattern as stack/queue/tree — no
// generator/StepPlayer. Undirected graph, adjacency-list backed. Node
// positions are computed fresh on every render via a circular layout
// (deterministic, no external force-directed layout library needed) —
// simplest approach that never overlaps and scales to any node count.

let graphNodes = {};  // id -> { id, x, y }  (x/y recomputed on each render)
let graphEdges = [];  // [ [u, v], ... ] undirected, deduplicated
let graphBusy = false; // guards against overlapping animated operations

function getNeighbors(id) {
    const neighbors = [];
    graphEdges.forEach(([a, b]) => {
        if (a === id) neighbors.push(b);
        else if (b === id) neighbors.push(a);
    });
    return neighbors.sort(); // deterministic traversal order
}

function addNode(id) {
    id = String(id).trim();
    if (!id || graphNodes[id]) return false;
    graphNodes[id] = { id };
    renderGraph();
    return true;
}

function addEdge(u, v) {
    u = String(u).trim();
    v = String(v).trim();
    if (!graphNodes[u] || !graphNodes[v] || u === v) return false;
    const exists = graphEdges.some(([a, b]) => (a === u && b === v) || (a === v && b === u));
    if (exists) return false;
    graphEdges.push([u, v]);
    renderGraph();
    return true;
}

/**
 * Renders the graph. `comparing` and `found` are arrays of node ID
 * STRINGS (not object refs, since nodes are keyed by id already) — amber
 * "actively at this node" vs. green "already visited".
 */
function renderGraph({ comparing = [], found = [] } = {}) {
    const container = document.getElementById('visualizer-container');
    if (!container) return;

    container.classList.remove('stack-mode', 'queue-mode', 'tree-mode');
    container.classList.add('graph-mode');
    container.innerHTML = '';

    const ids = Object.keys(graphNodes);
    if (ids.length === 0) {
        const empty = document.createElement('div');
        empty.classList.add('empty-structure-msg');
        empty.innerText = 'Graph is empty — add a node to begin';
        container.appendChild(empty);
        return;
    }

    // Circular layout: evenly space nodes around a circle whose radius
    // grows with node count so they never crowd each other.
    const radius = Math.max(90, ids.length * 14);
    const padding = 44;
    const size = radius * 2 + padding * 2;
    const centerX = size / 2;
    const centerY = size / 2;

    ids.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2; // start at top, go clockwise
        graphNodes[id].x = centerX + radius * Math.cos(angle);
        graphNodes[id].y = centerY + radius * Math.sin(angle);
    });

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.classList.add('graph-svg');

    // Edges first so node circles render on top of the lines
    graphEdges.forEach(([a, b]) => {
        const na = graphNodes[a];
        const nb = graphNodes[b];
        if (!na || !nb) return;
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', na.x);
        line.setAttribute('y1', na.y);
        line.setAttribute('x2', nb.x);
        line.setAttribute('y2', nb.y);
        line.classList.add('graph-edge');
        svg.appendChild(line);
    });

    ids.forEach(id => {
        const node = graphNodes[id];
        const g = document.createElementNS(svgNS, 'g');
        g.classList.add('graph-node');
        if (comparing.includes(id)) g.classList.add('comparing');
        if (found.includes(id)) g.classList.add('found');

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', 22);
        g.appendChild(circle);

        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.textContent = id;
        g.appendChild(text);

        svg.appendChild(g);
    });

    container.appendChild(svg);
}

async function bfsTraversal(start) {
    if (graphBusy) return;
    start = String(start).trim();
    const statusBar = document.getElementById('status-bar');

    if (!graphNodes[start]) {
        statusBar.className = 'status-message error';
        statusBar.innerText = `Node ${start} doesn't exist`;
        return;
    }

    graphBusy = true;
    const myGeneration = workspaceGeneration;

    try {
        const visited = new Set([start]);
        const queue = [start];
        const order = [];

        renderGraph({ comparing: [start] });
        statusBar.className = 'status-message searching';
        statusBar.innerText = `Starting BFS from ${start}...`;
        await sleep(getSpeed());
        if (myGeneration !== workspaceGeneration) return; // navigated away mid-animation

        while (queue.length > 0) {
            const current = queue.shift();
            order.push(current);
            renderGraph({ comparing: [current], found: [...order] });
            statusBar.className = 'status-message searching';
            statusBar.innerText = `Visiting ${current}. BFS order: ${order.join(' \u2192 ')}`;
            await sleep(getSpeed());
            if (myGeneration !== workspaceGeneration) return;

            for (const neighbor of getNeighbors(current)) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        renderGraph({ found: order });
        statusBar.className = 'status-message success';
        statusBar.innerText = `BFS order: ${order.join(' \u2192 ')}`;
    } finally {
        graphBusy = false;
    }
}

async function dfsTraversal(start) {
    if (graphBusy) return;
    start = String(start).trim();
    const statusBar = document.getElementById('status-bar');

    if (!graphNodes[start]) {
        statusBar.className = 'status-message error';
        statusBar.innerText = `Node ${start} doesn't exist`;
        return;
    }

    graphBusy = true;
    const myGeneration = workspaceGeneration;

    try {
        const visited = new Set();
        const order = [];
        let cancelled = false;

        async function visit(node) {
            if (cancelled) return;
            visited.add(node);
            order.push(node);
            renderGraph({ comparing: [node], found: [...order] });
            statusBar.className = 'status-message searching';
            statusBar.innerText = `Visiting ${node}. DFS order: ${order.join(' \u2192 ')}`;
            await sleep(getSpeed());
            if (myGeneration !== workspaceGeneration) { cancelled = true; return; }

            for (const neighbor of getNeighbors(node)) {
                if (!visited.has(neighbor)) {
                    await visit(neighbor);
                }
            }
        }

        await visit(start);
        if (cancelled) return;

        renderGraph({ found: order });
        statusBar.className = 'status-message success';
        statusBar.innerText = `DFS order: ${order.join(' \u2192 ')}`;
    } finally {
        graphBusy = false;
    }
}

async function generateRandomGraph() {
    if (graphBusy) return;
    clearGraph();

    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    labels.forEach(id => addNode(id));

    // Spanning tree first (guarantees a connected graph), then a couple
    // of extra random edges so BFS/DFS have some genuine branching/cycles.
    for (let i = 1; i < labels.length; i++) {
        const j = Math.floor(Math.random() * i);
        addEdge(labels[i], labels[j]);
    }

    let extra = 2;
    let attempts = 0;
    while (extra > 0 && attempts < 20) {
        attempts++;
        const a = labels[Math.floor(Math.random() * labels.length)];
        const b = labels[Math.floor(Math.random() * labels.length)];
        if (a !== b && addEdge(a, b)) extra--;
    }

    const statusBar = document.getElementById('status-bar');
    statusBar.className = 'status-message success';
    statusBar.innerText = 'Generated a random graph';
}

function clearGraph() {
    workspaceGeneration++; // orphan any pending animation so it can't resurrect after this clear
    graphNodes = {};
    graphEdges = [];
    graphBusy = false;
    renderGraph();
    const statusBar = document.getElementById('status-bar');
    if (statusBar) statusBar.className = 'status-message hidden';
}