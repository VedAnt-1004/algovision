
// ==========================================
// GRAPH ENGINE (js/structures/graph.js)
// ==========================================
// Same "live/persistent structure" pattern as stack/queue/tree. Undirected
// graph, adjacency-list backed. Node positions are computed fresh on every
// render via a circular layout (deterministic, no external force-directed
// layout library needed) — simplest approach that never overlaps and
// scales to any node count.
//
// TRAVERSALS: bfsSteps / dfsSteps are PURE function* generators (no DOM, no
// timers, no app.js state) that yield discrete step snapshots — same
// contract as js/algorithms/*.js:
//   { phase, message, statusClass, highlights }
// highlights = { comparing, current, found, order, activeEdges, visitedEdges }
// app.js imports them, drives the for...of loop, and owns all UI and
// code-panel updates (phase → lineMap line in data.js).
//
// Highlight semantics (all node IDs are strings):
//   comparing → amber : node currently being processed
//   current   → blue  : BFS: discovered, waiting in the queue
//                       DFS: open on the recursion stack (in progress)
//   found     → green : BFS: fully processed / DFS: finished (backtracked)
//   order     → small numbered badge showing visit order
//   activeEdges  → amber, thick : edge being examined this step
//   visitedEdges → green        : edges that discovered a new node
// Precedence when an ID is in several lists: comparing > found > current
// (in practice the lists are disjoint for both traversals).

import { bumpWorkspaceGeneration } from '../visualizer.js';

export let graphNodes = {};  // id -> { id, x, y }  (x/y recomputed on each render)
export let graphEdges = [];  // [ [u, v], ... ] undirected, deduplicated

export function getNeighbors(id) {
    const neighbors = [];
    graphEdges.forEach(([a, b]) => {
        if (a === id) neighbors.push(b);
        else if (b === id) neighbors.push(a);
    });
    return neighbors.sort(); // deterministic traversal order
}

// Snapshot of the graph as { id: [neighbors...] } — the same shape the
// bfs()/dfs() code snippets in data.js take as `graph`. app.js passes this
// (plus a start node) into bfsSteps / dfsSteps.
export function buildAdjacency() {
    const adjacency = {};
    Object.keys(graphNodes).forEach(id => {
        adjacency[id] = getNeighbors(id);
    });
    return adjacency;
}

// Order-independent key so [A,B] and [B,A] match the same undirected edge.
function edgeKey(a, b) {
    return [a, b].sort().join('\u0001');
}

export function addNode(id) {
    id = String(id).trim();
    if (!id || graphNodes[id]) return false;
    graphNodes[id] = { id };
    renderGraph();
    return true;
}

export function addEdge(u, v) {
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
 * Renders the graph. `comparing`, `current`, `found` and `order` are arrays
 * of node ID STRINGS (nodes are keyed by id already); `activeEdges` and
 * `visitedEdges` are arrays of [u, v] ID pairs. Non-color cues: the amber
 * node is drawn slightly larger, the active edge is thicker, visited nodes
 * carry a numbered order badge.
 */
export function renderGraph({ comparing = [], current = [], found = [], order = [], activeEdges = [], visitedEdges = [] } = {}) {
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

    const activeEdgeKeys = new Set(activeEdges.map(([a, b]) => edgeKey(a, b)));
    const visitedEdgeKeys = new Set(visitedEdges.map(([a, b]) => edgeKey(a, b)));
    const orderIndex = new Map(order.map((id, i) => [id, i + 1]));

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

        // No edge-state rules exist in style.css, so edge highlighting is
        // applied inline via the locked state tokens (inline beats the
        // .graph-edge class rule).
        const key = edgeKey(a, b);
        if (activeEdgeKeys.has(key)) {
            line.style.stroke = 'var(--state-amber)';
            line.style.strokeWidth = '5';
        } else if (visitedEdgeKeys.has(key)) {
            line.style.stroke = 'var(--state-emerald)';
            line.style.strokeWidth = '4';
        }
        svg.appendChild(line);
    });

    ids.forEach(id => {
        const node = graphNodes[id];
        const isComparing = comparing.includes(id);
        const isFound = !isComparing && found.includes(id);
        const isCurrent = !isComparing && !isFound && current.includes(id);

        const g = document.createElementNS(svgNS, 'g');
        g.classList.add('graph-node');
        if (isComparing) g.classList.add('comparing');
        if (isFound) g.classList.add('found');
        if (isCurrent) g.classList.add('current');

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', isComparing ? 26 : 22);
        if (isCurrent) {
            circle.style.fill = 'var(--state-blue)';
            circle.style.stroke = 'var(--state-blue)';
        }
        g.appendChild(circle);

        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.textContent = id;
        g.appendChild(text);

        if (orderIndex.has(id)) {
            const badge = document.createElementNS(svgNS, 'circle');
            badge.setAttribute('cx', node.x + 18);
            badge.setAttribute('cy', node.y - 18);
            badge.setAttribute('r', 10);
            badge.style.fill = 'var(--panel-dark)';
            badge.style.stroke = 'white';
            badge.style.strokeWidth = '1.5';
            g.appendChild(badge);

            const badgeText = document.createElementNS(svgNS, 'text');
            badgeText.setAttribute('x', node.x + 18);
            badgeText.setAttribute('y', node.y - 18);
            badgeText.setAttribute('text-anchor', 'middle');
            badgeText.setAttribute('dominant-baseline', 'central');
            badgeText.style.fontSize = '11px';
            badgeText.style.fill = 'white';
            badgeText.textContent = orderIndex.get(id);
            g.appendChild(badgeText);
        }

        svg.appendChild(g);
    });

    container.appendChild(svg);
}

export async function generateRandomGraph() {
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

export function clearGraph() {
    bumpWorkspaceGeneration(); // orphan any pending traversal so it can't resurrect after this clear
    graphNodes = {};
    graphEdges = [];
    renderGraph();
    const statusBar = document.getElementById('status-bar');
    if (statusBar) statusBar.className = 'status-message hidden';
}

// Resets state without rendering. ES module imports are read-only, so
// app.js can't assign graphNodes/graphEdges itself when it builds a workspace.
export function resetGraph() {
    graphNodes = {};
    graphEdges = [];
}

// ==========================================
// TRAVERSAL GENERATORS (pure — no DOM, no timers, no app.js state)
// ==========================================

/**
 * Breadth-First Search. `adjacency` is { id: [neighbors...] } (see
 * buildAdjacency). Phases: start, dequeue, visit, check-neighbor, enqueue, done
 */
export function* bfsSteps(adjacency, start) {
    const visited = new Set([start]);
    const queue = [start];
    const order = [];      // visit order (dequeue order)
    const finished = [];   // nodes whose neighbors have all been scanned
    const treeEdges = [];  // edges that discovered a new node
    const totalNodes = Object.keys(adjacency).length;

    const fmtQueue = () => `[${queue.join(', ')}]`;
    const snap = (active = null, activeEdges = []) => ({
        comparing: active === null ? [] : [active],
        current: [...queue],
        found: [...finished],
        order: [...order],
        activeEdges: activeEdges.map(e => [...e]),
        visitedEdges: treeEdges.map(e => [...e])
    });

    yield {
        phase: 'start',
        message: `Start at ${start}: mark it visited and enqueue it. Queue: ${fmtQueue()}`,
        statusClass: 'searching',
        highlights: snap()
    };

    while (queue.length > 0) {
        const node = queue.shift();

        yield {
            phase: 'dequeue',
            message: `Dequeue ${node} from the front. Queue: ${fmtQueue()}`,
            statusClass: 'searching',
            highlights: snap(node)
        };

        order.push(node);

        yield {
            phase: 'visit',
            message: `Visit ${node}. BFS order: ${order.join(' \u2192 ')}`,
            statusClass: 'searching',
            highlights: snap(node)
        };

        for (const neighbor of adjacency[node]) {
            const isNew = !visited.has(neighbor);

            yield {
                phase: 'check-neighbor',
                message: isNew
                    ? `Checking ${neighbor} (neighbor of ${node}): not visited yet`
                    : `Checking ${neighbor} (neighbor of ${node}): already visited — skip`,
                statusClass: 'searching',
                highlights: snap(node, [[node, neighbor]])
            };

            if (isNew) {
                visited.add(neighbor);
                queue.push(neighbor);
                treeEdges.push([node, neighbor]);

                yield {
                    phase: 'enqueue',
                    message: `Mark ${neighbor} visited and enqueue it. Queue: ${fmtQueue()}`,
                    statusClass: 'searching',
                    highlights: snap(node, [[node, neighbor]])
                };
            }
        }

        finished.push(node);
    }

    const reachNote = order.length < totalNodes ? ` (${order.length} of ${totalNodes} nodes reachable from ${start})` : '';
    yield {
        phase: 'done',
        message: `BFS complete: ${order.join(' \u2192 ')}${reachNote}`,
        statusClass: 'success',
        highlights: snap()
    };
}

/**
 * Depth-First Search (recursive). Phases: start, visit, check-neighbor,
 * recurse, backtrack, done
 */
export function* dfsSteps(adjacency, start) {
    const visited = new Set();
    const order = [];      // discovery order
    const stack = [];      // nodes with an open recursive call
    const finished = [];   // nodes that have backtracked out
    const treeEdges = [];  // edges that led to a newly discovered node
    const totalNodes = Object.keys(adjacency).length;

    const snap = (active = null, activeEdges = []) => ({
        comparing: active === null ? [] : [active],
        current: stack.filter(n => n !== active),
        found: [...finished],
        order: [...order],
        activeEdges: activeEdges.map(e => [...e]),
        visitedEdges: treeEdges.map(e => [...e])
    });

    yield {
        phase: 'start',
        message: `Starting DFS from ${start}`,
        statusClass: 'searching',
        highlights: snap()
    };

    function* visit(node, parent) {
        visited.add(node);
        order.push(node);
        stack.push(node);

        yield {
            phase: 'visit',
            message: `Visit ${node}: mark it visited. DFS order: ${order.join(' \u2192 ')}`,
            statusClass: 'searching',
            highlights: snap(node)
        };

        for (const neighbor of adjacency[node]) {
            const isNew = !visited.has(neighbor);

            yield {
                phase: 'check-neighbor',
                message: isNew
                    ? `Checking ${neighbor} (neighbor of ${node}): not visited yet`
                    : `Checking ${neighbor} (neighbor of ${node}): already visited — skip`,
                statusClass: 'searching',
                highlights: snap(node, [[node, neighbor]])
            };

            if (isNew) {
                treeEdges.push([node, neighbor]);

                yield {
                    phase: 'recurse',
                    message: `Go deeper: ${node} \u2192 ${neighbor}`,
                    statusClass: 'searching',
                    highlights: snap(node, [[node, neighbor]])
                };

                yield* visit(neighbor, node);
            }
        }

        stack.pop();
        finished.push(node);

        yield {
            phase: 'backtrack',
            message: parent === null
                ? `${node} is finished — no unvisited neighbors left`
                : `${node} is finished — backtrack to ${parent}`,
            statusClass: 'searching',
            highlights: snap(parent)
        };
    }

    yield* visit(start, null);

    const reachNote = order.length < totalNodes ? ` (${order.length} of ${totalNodes} nodes reachable from ${start})` : '';
    yield {
        phase: 'done',
        message: `DFS complete: ${order.join(' \u2192 ')}${reachNote}`,
        statusClass: 'success',
        highlights: snap()
    };
}
