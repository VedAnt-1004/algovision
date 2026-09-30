/** @jest-environment jsdom */
// ==========================================
// STRUCTURE ENGINE TESTS (test/dom/structures.test.js)
// ==========================================
// Covers the four live/persistent structure engines: stack.js, queue.js,
// tree.js (Binary Search Tree) and graph.js. Unlike the pure generators in
// test/unit/, the animated operations here mutate the DOM directly
// (renderStack(), renderTree(), ...) and several use real timing (stack/queue
// hardcode a 300ms sleep matching the CSS pop/dequeue transition; tree
// insert/search/delete use sleep(getSpeed())) — so, like
// test/dom/stepplayer.test.js, this runs under jest-environment-jsdom with a
// real #visualizer-container and #status-bar.
//
// TRAVERSALS: In-Order / Pre-Order / Post-Order (tree.js) and BFS / DFS
// (graph.js) are PURE generators — inorderSteps, preorderSteps,
// postorderSteps, bfsSteps, dfsSteps. The for...of runners that animate them
// (runTraversal / runGraphTraversal) live in app.js and own all UI and
// code-panel updates, so they are NOT tested here. Instead this file asserts
// directly against the generators' yielded states (phase sequences,
// highlights, messages), plus how renderTree()/renderGraph() draw those
// highlights, plus that every yielded phase resolves to a real lineMap line
// in data.js for JS, Python and C++.
//
// Two timing strategies for the animated operations, chosen per module and
// verified empirically before being relied on:
//   - stack/queue's popFromStack()/dequeue() hardcode `sleep(300)` (it's tied
//     to a fixed CSS transition, not getSpeed()), so fake timers are the only
//     way to test them without a real 300ms wait per test. The pattern —
//     start the call, advanceTimersByTime, then await the promise — is the
//     same one already proven in test/dom/stepplayer.test.js.
//   - tree insert/search/delete use `sleep(getSpeed())`, so instead of fake
//     timers this file just sets a real, tiny speed via setSpeed(0) and
//     awaits normally.
//
// Every generator phase sequence below was run against the real generators
// first to confirm the exact expected output, not hand-derived from reading
// the source.

import { bumpWorkspaceGeneration, setSpeed, sleep, workspaceGeneration } from '../../js/visualizer.js';
import { algorithmDatabase } from '../../js/data.js';
import {
    stackState,
    renderStack,
    pushToStack,
    popFromStack,
    peekStack,
    clearStack,
} from '../../js/structures/stack.js';
import {
    queueState,
    renderQueue,
    enqueue,
    dequeue,
    peekQueue,
    clearQueue,
} from '../../js/structures/queue.js';
import * as treeModule from '../../js/structures/tree.js';
import {
    treeRoot,
    createTreeNode,
    insertIntoTree,
    findMinNode,
    deleteFromTree,
    renderTree,
    insertNode,
    searchTree,
    deleteNode,
    clearTree,
    resetTree,
    isTreeBusy,
    inorderSteps,
    preorderSteps,
    postorderSteps,
} from '../../js/structures/tree.js';
import * as graphModule from '../../js/structures/graph.js';
import {
    graphNodes,
    graphEdges,
    getNeighbors,
    buildAdjacency,
    addNode,
    addEdge,
    renderGraph,
    bfsSteps,
    dfsSteps,
    generateRandomGraph,
    clearGraph,
    resetGraph,
} from '../../js/structures/graph.js';

// ---------- Shared setup ----------

// setStackControlsDisabled()/setQueueControlsDisabled() each only touch their
// OWN specific ids (confirmed against the source) — push/pop are stack-only,
// enqueue/dequeue are queue-only, peek/clear are shared by both, matching how
// app.js only ever builds one workspace's controls at a time.
const STACK_CONTROL_IDS = ['push-btn', 'pop-btn', 'peek-btn', 'clear-btn'];
const QUEUE_CONTROL_IDS = ['enqueue-btn', 'dequeue-btn', 'peek-btn', 'clear-btn'];
const ALL_CONTROL_IDS = [...new Set([...STACK_CONTROL_IDS, ...QUEUE_CONTROL_IDS])];

beforeEach(() => {
    document.body.innerHTML = `
        <div id="visualizer-container"></div>
        <div id="status-bar" class="status-message hidden"></div>
        ${ALL_CONTROL_IDS.map((id) => `<button id="${id}"></button>`).join('\n')}
    `;
    // clearX() (not the bare resetX()) on purpose: it also resets each
    // module's busy flag and bumps the workspace generation, so a test that
    // throws mid-animation (leaving e.g. queueBusy stuck true, since
    // resetQueue() alone doesn't touch it) can never leak into the next test.
    clearStack();
    clearQueue();
    clearTree();
    clearGraph();
    setSpeed(0); // tree animated ops use real timers at effectively-zero delay
});

afterEach(() => {
    jest.useRealTimers();
});

const statusText = () => document.getElementById('status-bar').innerText;
const statusClass = () => document.getElementById('status-bar').className;
const isDisabled = (id) => document.getElementById(id).disabled;
const blockTexts = () => [...document.querySelectorAll('.array-block')].map((el) => el.innerText);

// ---------- Generator helpers ----------

// Builds a plain {value,left,right} BST by repeated insertIntoTree(), with no
// DOM or animation involved — the input the tree generators are handed.
function buildTree(values) {
    return values.reduce((root, value) => insertIntoTree(root, value), null);
}

const collect = (generator) => [...generator];
const phasesOf = (steps) => steps.map((step) => step.phase);
const lastOf = (list) => list[list.length - 1];
const countPhase = (steps, phase) => steps.filter((step) => step.phase === phase).length;
// Value/id of the node being processed on every 'visit' step, in order.
const visitOrderOf = (steps) => steps.filter((step) => step.phase === 'visit').map((step) => step.highlights.comparing[0]);

// Diamond A-B-C-D with a D-E tail:  A-B, A-C, B-D, C-D, D-E
const DIAMOND_EDGES = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E']];
const DIAMOND_ADJACENCY = {
    A: ['B', 'C'],
    B: ['A', 'D'],
    C: ['A', 'D'],
    D: ['B', 'C', 'E'],
    E: ['D'],
};

function buildDiamondGraph() {
    ['A', 'B', 'C', 'D', 'E'].forEach(addNode);
    DIAMOND_EDGES.forEach(([u, v]) => addEdge(u, v));
}

// Freezes an adjacency object all the way down, to prove the graph
// generators never mutate their input.
function deepFreezeAdjacency(adjacency) {
    Object.values(adjacency).forEach((neighbors) => Object.freeze(neighbors));
    return Object.freeze(adjacency);
}

// =====================================================================
// 1. STACK (LIFO)
// =====================================================================

describe('stack', () => {
    test('renderStack() shows the empty-state message and tags the container stack-mode', () => {
        renderStack();
        expect(document.querySelector('.empty-structure-msg')).not.toBeNull();
        expect(document.getElementById('visualizer-container').classList.contains('stack-mode')).toBe(true);
        expect(blockTexts()).toEqual([]);
    });

    test('pushToStack() adds to the top, in LIFO order, and reports success', async () => {
        await pushToStack(5);
        await pushToStack(7);
        await pushToStack(9);

        expect(stackState).toEqual([5, 7, 9]);
        expect(blockTexts()).toEqual([5, 7, 9]); // rendered bottom-to-top in DOM order
        expect(statusText()).toBe('Pushed 9 onto the stack');
        expect(statusClass()).toBe('status-message success');
    });

    test('only the top block is marked "current" and labeled TOP', async () => {
        await pushToStack(1);
        await pushToStack(2);

        const blocks = [...document.querySelectorAll('.stack-block-wrapper')];
        expect(blocks[0].querySelector('.array-block').classList.contains('current')).toBe(false);
        expect(blocks[0].querySelector('.stack-side-label')).toBeNull();
        expect(blocks[1].querySelector('.array-block').classList.contains('current')).toBe(true);
        expect(blocks[1].querySelector('.stack-side-label').innerText).toBe('← TOP');
    });

    test('popFromStack() on an empty stack returns null and reports an error, without throwing', async () => {
        const result = await popFromStack();
        expect(result).toBeNull();
        expect(statusText()).toBe('Stack is empty — nothing to pop');
        expect(statusClass()).toBe('status-message error');
    });

    test('popFromStack() removes and returns the top value (LIFO), after the pop animation', async () => {
        jest.useFakeTimers();
        await pushToStack(1);
        await pushToStack(2);
        await pushToStack(3);

        const popPromise = popFromStack();
        jest.advanceTimersByTime(300); // matches the hardcoded animation duration
        const popped = await popPromise;

        expect(popped).toBe(3);
        expect(stackState).toEqual([1, 2]);
        expect(statusText()).toBe('Popped 3 from the stack');
    });

    test('the popping block gets the "popping" class the instant Pop starts, before the animation finishes', async () => {
        jest.useFakeTimers();
        await pushToStack(1);

        const popPromise = popFromStack();
        expect(document.querySelector('.array-block.popping')).not.toBeNull();

        jest.advanceTimersByTime(300);
        await popPromise;
        expect(document.querySelector('.array-block.popping')).toBeNull(); // re-rendered afterward
    });

    test('controls are disabled while a pop animation is in flight, and re-enabled after', async () => {
        jest.useFakeTimers();
        await pushToStack(1);

        const popPromise = popFromStack();
        STACK_CONTROL_IDS.forEach((id) => expect(isDisabled(id)).toBe(true));

        jest.advanceTimersByTime(300);
        await popPromise;

        STACK_CONTROL_IDS.forEach((id) => expect(isDisabled(id)).toBe(false));
    });

    test('a second popFromStack() called while one is already animating is dropped (returns null, no extra pop)', async () => {
        jest.useFakeTimers();
        await pushToStack(1);
        await pushToStack(2);

        const first = popFromStack();
        const second = popFromStack(); // stackBusy is already true

        jest.advanceTimersByTime(300);
        const [firstResult, secondResult] = await Promise.all([first, second]);

        expect(firstResult).toBe(2);
        expect(secondResult).toBeNull();
        expect(stackState).toEqual([1]); // only one element actually left
    });

    test('a pop cancelled mid-animation (workspace switched away) does not mutate state or resurrect afterward', async () => {
        jest.useFakeTimers();
        await pushToStack(1);
        await pushToStack(2);

        const popPromise = popFromStack();
        bumpWorkspaceGeneration(); // simulates leaving this workspace mid-pop
        jest.advanceTimersByTime(300);
        const result = await popPromise;

        expect(result).toBeNull();
        expect(stackState).toEqual([1, 2]); // untouched — the pop never actually happened
    });

    test('peekStack(): empty reports an error; non-empty returns the top without removing it', async () => {
        expect(peekStack()).toBeNull();
        expect(statusText()).toBe('Stack is empty — nothing to peek');

        await pushToStack(4);
        await pushToStack(8);
        expect(peekStack()).toBe(8);
        expect(stackState).toEqual([4, 8]); // unchanged
        expect(statusText()).toBe('Top of stack: 8');
        expect(statusClass()).toBe('status-message searching');
    });

    test('clearStack() empties the stack, hides the status bar, and re-enables controls', async () => {
        await pushToStack(1);
        await pushToStack(2);

        clearStack();

        expect(stackState).toEqual([]);
        expect(document.querySelector('.empty-structure-msg')).not.toBeNull();
        expect(statusClass()).toBe('status-message hidden');
        STACK_CONTROL_IDS.forEach((id) => expect(isDisabled(id)).toBe(false));
    });

    test('clearStack() during a pending pop prevents that pop from completing afterward', async () => {
        jest.useFakeTimers();
        await pushToStack(1);
        await pushToStack(2);

        const popPromise = popFromStack();
        clearStack(); // bumps the generation itself
        jest.advanceTimersByTime(300);
        const result = await popPromise;

        expect(result).toBeNull();
        expect(stackState).toEqual([]); // clearStack's own reset, not corrupted by the stale pop
    });
});

// =====================================================================
// 2. QUEUE (FIFO)
// =====================================================================

describe('queue', () => {
    test('renderQueue() shows the empty-state message and tags the container queue-mode', () => {
        renderQueue();
        expect(document.querySelector('.empty-structure-msg')).not.toBeNull();
        expect(document.getElementById('visualizer-container').classList.contains('queue-mode')).toBe(true);
    });

    test('enqueue() adds at the rear, in FIFO order, and reports success', async () => {
        await enqueue(1);
        await enqueue(2);
        await enqueue(3);

        expect(queueState).toEqual([1, 2, 3]);
        expect(blockTexts()).toEqual([1, 2, 3]);
        expect(statusText()).toBe('Enqueued 3 at the rear');
    });

    test('FRONT/REAR labels: single element is both, otherwise the ends are labeled and the middle is blank', async () => {
        await enqueue(1);
        let wrappers = [...document.querySelectorAll('.queue-block-wrapper')];
        expect(wrappers[0].querySelector('span').innerText).toBe('FRONT / REAR');

        await enqueue(2);
        await enqueue(3);
        wrappers = [...document.querySelectorAll('.queue-block-wrapper')];
        expect(wrappers[0].querySelector('span').classList.contains('queue-label-front')).toBe(true);
        expect(wrappers[1].querySelector('span').classList.contains('queue-label-spacer')).toBe(true);
        expect(wrappers[2].querySelector('span').classList.contains('queue-label-rear')).toBe(true);
        expect(wrappers[0].querySelector('.array-block').classList.contains('current')).toBe(true); // front only
        expect(wrappers[2].querySelector('.array-block').classList.contains('current')).toBe(false);
    });

    test('dequeue() on an empty queue returns null and reports an error', async () => {
        const result = await dequeue();
        expect(result).toBeNull();
        expect(statusText()).toBe('Queue is empty — nothing to dequeue');
    });

    test('dequeue() removes and returns the FRONT value (FIFO), after the animation', async () => {
        jest.useFakeTimers();
        await enqueue(1);
        await enqueue(2);
        await enqueue(3);

        const dequeuePromise = dequeue();
        jest.advanceTimersByTime(300);
        const dequeued = await dequeuePromise;

        expect(dequeued).toBe(1); // NOT 3 — confirms FIFO, not LIFO
        expect(queueState).toEqual([2, 3]);
        expect(statusText()).toBe('Dequeued 1 from the front');
    });

    test('controls are disabled during a dequeue animation and re-enabled after', async () => {
        jest.useFakeTimers();
        await enqueue(1);

        const dequeuePromise = dequeue();
        QUEUE_CONTROL_IDS.forEach((id) => expect(isDisabled(id)).toBe(true));

        jest.advanceTimersByTime(300);
        await dequeuePromise;
        QUEUE_CONTROL_IDS.forEach((id) => expect(isDisabled(id)).toBe(false));
    });

    test('a second dequeue() called mid-animation is dropped', async () => {
        jest.useFakeTimers();
        await enqueue(1);
        await enqueue(2);

        const first = dequeue();
        const second = dequeue();
        jest.advanceTimersByTime(300);
        const [firstResult, secondResult] = await Promise.all([first, second]);

        expect(firstResult).toBe(1);
        expect(secondResult).toBeNull();
        expect(queueState).toEqual([2]);
    });

    test('a dequeue cancelled mid-animation does not mutate state', async () => {
        jest.useFakeTimers();
        await enqueue(1);
        await enqueue(2);

        const dequeuePromise = dequeue();
        bumpWorkspaceGeneration();
        jest.advanceTimersByTime(300);
        const result = await dequeuePromise;

        expect(result).toBeNull();
        expect(queueState).toEqual([1, 2]);
    });

    test('peekQueue(): empty reports an error; non-empty returns the front without removing it', async () => {
        expect(peekQueue()).toBeNull();

        await enqueue(4);
        await enqueue(8);
        expect(peekQueue()).toBe(4); // front, not rear
        expect(queueState).toEqual([4, 8]);
        expect(statusText()).toBe('Front of queue: 4');
    });

    test('clearQueue() empties the queue and re-enables controls', async () => {
        await enqueue(1);
        await enqueue(2);
        clearQueue();

        expect(queueState).toEqual([]);
        expect(statusClass()).toBe('status-message hidden');
        QUEUE_CONTROL_IDS.forEach((id) => expect(isDisabled(id)).toBe(false));
    });
});

// =====================================================================
// 3. BINARY SEARCH TREE
// =====================================================================

describe('tree: pure logic (createTreeNode / insertIntoTree / findMinNode / deleteFromTree)', () => {
    // In-order traversal of a plain {value,left,right} node tree, for asserting
    // structure without depending on any DOM/animated function.
    function inOrder(node) {
        if (!node) return [];
        return [...inOrder(node.left), node.value, ...inOrder(node.right)];
    }

    test('createTreeNode() builds a leaf with null children', () => {
        expect(createTreeNode(5)).toEqual({ value: 5, left: null, right: null });
    });

    test('insertIntoTree() builds correct BST shape: smaller left, larger right', () => {
        let root = null;
        [50, 30, 70, 20, 40, 60, 80].forEach((v) => {
            root = insertIntoTree(root, v);
        });

        expect(root.value).toBe(50);
        expect(root.left.value).toBe(30);
        expect(root.right.value).toBe(70);
        expect(root.left.left.value).toBe(20);
        expect(root.left.right.value).toBe(40);
        expect(root.right.left.value).toBe(60);
        expect(root.right.right.value).toBe(80);
        expect(inOrder(root)).toEqual([20, 30, 40, 50, 60, 70, 80]); // always sorted
    });

    test('insertIntoTree() rejects a duplicate value: tree shape is unchanged', () => {
        let root = null;
        [50, 30, 70].forEach((v) => {
            root = insertIntoTree(root, v);
        });
        const before = JSON.stringify(root);

        const after = insertIntoTree(root, 30); // already present

        expect(JSON.stringify(after)).toBe(before);
        expect(inOrder(after)).toEqual([30, 50, 70]); // no duplicate entry
    });

    test('insertIntoTree() into an empty tree creates the root', () => {
        expect(insertIntoTree(null, 42)).toEqual({ value: 42, left: null, right: null });
    });

    test('findMinNode() returns the leftmost node of a subtree', () => {
        let root = null;
        [50, 30, 70, 20, 40].forEach((v) => {
            root = insertIntoTree(root, v);
        });
        expect(findMinNode(root).value).toBe(20);
        expect(findMinNode(root.right).value).toBe(70); // 70 has no left child, so it's its own min
    });

    describe('deleteFromTree()', () => {
        function buildTreeFrom(values) {
            let root = null;
            values.forEach((v) => {
                root = insertIntoTree(root, v);
            });
            return root;
        }

        test('deleting from an empty tree (null root) returns null', () => {
            expect(deleteFromTree(null, 99)).toBeNull();
        });

        test('deleting a value that is not present leaves the tree unchanged', () => {
            const root = buildTreeFrom([50, 30, 70]);
            const before = JSON.stringify(root);
            const after = deleteFromTree(root, 999);
            expect(JSON.stringify(after)).toBe(before);
        });

        test('deleting a leaf removes it and nothing else', () => {
            const root = buildTreeFrom([50, 30, 70, 20]);
            const after = deleteFromTree(root, 20);
            expect(inOrder(after)).toEqual([30, 50, 70]);
            expect(after.left.left).toBeNull();
        });

        test('deleting a node with one child promotes that child', () => {
            const root = buildTreeFrom([50, 30, 70, 20]); // 30 has only a left child (20)
            const after = deleteFromTree(root, 30);
            expect(inOrder(after)).toEqual([20, 50, 70]);
            expect(after.left.value).toBe(20);
        });

        test('deleting a node with two children replaces it with its in-order successor', () => {
            const root = buildTreeFrom([50, 30, 70, 60, 80]); // 70 has two children; successor is 80's... actually 80 has no left, successor of 70 is 80? verify: right subtree of 70 is 80 only (60 is LEFT of 70) — successor = min(right subtree) = 80
            const after = deleteFromTree(root, 70);
            expect(inOrder(after)).toEqual([30, 50, 60, 80]);
            expect(after.right.value).toBe(80); // 70 replaced by 80 in place
            expect(after.right.right).toBeNull(); // 80's old slot is now empty
        });

        test('deleting the root with two children keeps the tree a valid BST', () => {
            const root = buildTreeFrom([50, 30, 70, 20, 40, 60, 80]);
            const after = deleteFromTree(root, 50);
            expect(inOrder(after)).toEqual([20, 30, 40, 60, 70, 80]);
            expect(after.value).toBe(60); // successor: min of the original right subtree
        });

        test('deleting every node one at a time empties the tree correctly', () => {
            let root = buildTreeFrom([5, 3, 8, 1, 4, 7, 9]);
            for (const v of [5, 3, 8, 1, 4, 7, 9]) {
                root = deleteFromTree(root, v);
            }
            expect(root).toBeNull();
        });
    });
});

describe('tree: animated DOM operations', () => {
    test('renderTree() shows the empty-state message and tags the container tree-mode', () => {
        renderTree();
        expect(document.querySelector('.empty-structure-msg')).not.toBeNull();
        expect(document.getElementById('visualizer-container').classList.contains('tree-mode')).toBe(true);
    });

    test('insertNode() into an empty tree makes it the root', async () => {
        await insertNode(50);
        expect(treeRoot).toEqual({ value: 50, left: null, right: null });
        expect(statusText()).toBe('Inserted 50');
        expect(document.querySelectorAll('.tree-node')).toHaveLength(1);
        expect(document.querySelectorAll('.tree-edge')).toHaveLength(0);
    });

    test('insertNode() builds a correct BST across several inserts, matching insertIntoTree()', async () => {
        for (const v of [50, 30, 70, 20, 40]) await insertNode(v);

        expect(treeRoot.value).toBe(50);
        expect(treeRoot.left.value).toBe(30);
        expect(treeRoot.right.value).toBe(70);
        expect(treeRoot.left.left.value).toBe(20);
        expect(treeRoot.left.right.value).toBe(40);
        expect(document.querySelectorAll('.tree-node')).toHaveLength(5);
        expect(document.querySelectorAll('.tree-edge')).toHaveLength(4); // n-1 edges for n nodes
    });

    test('insertNode() rejects a duplicate: tree is unchanged and status reports the conflict', async () => {
        await insertNode(50);
        await insertNode(30);
        const before = JSON.stringify(treeRoot);

        await insertNode(30);

        expect(JSON.stringify(treeRoot)).toBe(before);
        expect(statusText()).toBe('30 already exists in the tree');
        expect(statusClass()).toBe('status-message error');
    });

    test('searchTree(): found highlights the node and reports success', async () => {
        for (const v of [50, 30, 70]) await insertNode(v);

        await searchTree(30);

        expect(statusText()).toBe('Found 30!');
        expect(statusClass()).toBe('status-message success');
        const foundNode = document.querySelector('.tree-node.found');
        expect(foundNode.textContent).toBe('30');
    });

    test('searchTree(): not found reports an error and does not throw', async () => {
        for (const v of [50, 30, 70]) await insertNode(v);
        await searchTree(999);
        expect(statusText()).toBe('999 not found in the tree');
        expect(statusClass()).toBe('status-message error');
    });

    test('searchTree() on an empty tree reports not found, not an exception', async () => {
        await searchTree(5);
        expect(statusText()).toBe('5 not found in the tree');
    });

    test('deleteNode(): removes a leaf and reports success', async () => {
        for (const v of [50, 30, 70, 20]) await insertNode(v);
        await deleteNode(20);

        expect(treeRoot.left.left).toBeNull();
        expect(statusText()).toBe('Deleted 20');
    });

    test('deleteNode(): two-children case replaces with the in-order successor, matching deleteFromTree()', async () => {
        for (const v of [50, 30, 70, 60, 80]) await insertNode(v);
        await deleteNode(70);

        expect(treeRoot.right.value).toBe(80);
        expect(treeRoot.right.right).toBeNull();
    });

    test('deleteNode(): missing value reports an error and leaves the tree untouched', async () => {
        for (const v of [50, 30, 70]) await insertNode(v);
        const before = JSON.stringify(treeRoot);

        await deleteNode(999);

        expect(JSON.stringify(treeRoot)).toBe(before);
        expect(statusText()).toBe('999 not found — nothing to delete');
    });

    test('deleteNode() on an empty tree reports "not found" (there is no separate empty-tree message here)', async () => {
        // deleteNode() has no upfront `if (!treeRoot)` check — an empty tree just
        // falls through the normal walk-and-fail-to-find path, so the message is
        // the generic "not found", not a dedicated "tree is empty" one.
        await deleteNode(5);
        expect(statusText()).toBe('5 not found — nothing to delete');
    });

    test('a second animated operation called while one is running is dropped (treeBusy guard)', async () => {
        await insertNode(50); // establishes a root first — inserting into an EMPTY tree has
        // no comparison walk at all, so it completes fully synchronously and would never
        // actually overlap with a second call; a non-empty tree is needed for the race below.

        setSpeed(20); // slow enough for the two calls to genuinely overlap
        const first = insertNode(30); // has to walk through 50 first — genuinely suspends
        const second = insertNode(70); // treeBusy is already true — should be a full no-op

        await Promise.all([first, second]);

        expect(treeRoot).toEqual({ value: 50, left: { value: 30, left: null, right: null }, right: null });
    });

    test('isTreeBusy() is true while an animated operation is in flight and false once it settles', async () => {
        await insertNode(50);
        expect(isTreeBusy()).toBe(false);

        setSpeed(20);
        const pending = insertNode(30); // walks through 50 first, so it genuinely suspends
        expect(isTreeBusy()).toBe(true);

        await pending;
        expect(isTreeBusy()).toBe(false);
    });

    test('clearing the workspace mid-insert cancels it: the value is never inserted afterward', async () => {
        setSpeed(20);
        await insertNode(10); // an existing node to walk past

        const pending = insertNode(5); // will walk through 10 first
        await sleep(5); // let it get partway through the comparison walk
        bumpWorkspaceGeneration(); // simulates leaving this workspace
        await pending;

        expect(treeRoot).toEqual({ value: 10, left: null, right: null }); // 5 was never added
    });

    test('clearTree() empties the tree, hides the status bar, and frees the busy lock for the next operation', async () => {
        for (const v of [50, 30, 70]) await insertNode(v);

        clearTree();

        expect(treeRoot).toBeNull();
        expect(document.querySelector('.empty-structure-msg')).not.toBeNull();
        expect(statusClass()).toBe('status-message hidden');

        await insertNode(1); // must not be blocked by a stuck lock
        expect(treeRoot.value).toBe(1);
    });

    test('resetTree() empties the tree and busy flag WITHOUT rendering (app.js calls it when opening a workspace)', async () => {
        for (const v of [50, 30, 70]) await insertNode(v);
        const htmlBefore = document.getElementById('visualizer-container').innerHTML;

        resetTree();

        expect(treeRoot).toBeNull();
        expect(isTreeBusy()).toBe(false);
        expect(document.getElementById('visualizer-container').innerHTML).toBe(htmlBefore); // no re-render
    });
});

// =====================================================================
// 3b. TREE TRAVERSAL GENERATORS (pure: no DOM, no timers, no app.js state)
// =====================================================================
// inorderSteps / preorderSteps / postorderSteps take a plain tree root and
// yield { phase, message, statusClass, highlights: { comparing, current,
// found, order } }. A tree with n nodes always yields exactly 4n + 3 steps:
// start + done, 3 per node (visit + go-left + go-right), and n + 1
// 'null-child' steps (one per empty child slot).

const TREE_GENERATORS = [
    ['inorderSteps', inorderSteps, 'In-Order'],
    ['preorderSteps', preorderSteps, 'Pre-Order'],
    ['postorderSteps', postorderSteps, 'Post-Order'],
];

// Root 2 with children 1 and 3.
const SMALL_TREE_VALUES = [2, 1, 3];
// Perfect 7-node BST: 50 / (30: 20, 40) / (70: 60, 80).
const PERFECT_TREE_VALUES = [50, 30, 70, 20, 40, 60, 80];

const EXPECTED_VISIT_ORDER = {
    inorderSteps: [20, 30, 40, 50, 60, 70, 80],
    preorderSteps: [50, 30, 20, 40, 70, 60, 80],
    postorderSteps: [20, 40, 30, 60, 80, 70, 50],
};

describe.each(TREE_GENERATORS)('%s: generator contract', (name, generatorFn, label) => {
    test('is a generator function that returns an iterator', () => {
        const generator = generatorFn(buildTree(SMALL_TREE_VALUES));
        expect(typeof generator.next).toBe('function');
        expect(generator[Symbol.iterator]()).toBe(generator);
        expect(Object.prototype.toString.call(generator)).toBe('[object Generator]');
    });

    test('every run starts with a "start" step in the "searching" state', () => {
        const steps = collect(generatorFn(buildTree(PERFECT_TREE_VALUES)));
        expect(steps[0].phase).toBe('start');
        expect(steps[0].statusClass).toBe('searching');
        expect(steps[0].message).toBe(`Starting ${label} traversal at root 50`);
        expect(steps[0].highlights).toEqual({ comparing: [], current: [], found: [], order: [] });
    });

    test('every run ends with exactly one "done" step, reporting success', () => {
        const steps = collect(generatorFn(buildTree(PERFECT_TREE_VALUES)));
        expect(countPhase(steps, 'done')).toBe(1);
        expect(lastOf(steps).phase).toBe('done');
        expect(lastOf(steps).statusClass).toBe('success');
    });

    test('every step has the shape the app.js runner and renderTree() expect', () => {
        collect(generatorFn(buildTree(PERFECT_TREE_VALUES))).forEach((step) => {
            expect(typeof step.phase).toBe('string');
            expect(step.phase.length).toBeGreaterThan(0);
            expect(typeof step.message).toBe('string');
            expect(step.message.length).toBeGreaterThan(0);
            expect(['searching', 'success']).toContain(step.statusClass);
            ['comparing', 'current', 'found', 'order'].forEach((key) => {
                expect(Array.isArray(step.highlights[key])).toBe(true);
            });
        });
    });

    test('only ever yields the six documented phases', () => {
        const phases = new Set(phasesOf(collect(generatorFn(buildTree(PERFECT_TREE_VALUES)))));
        expect([...phases].sort()).toEqual(['done', 'go-left', 'go-right', 'null-child', 'start', 'visit']);
    });

    test('a tree with n nodes yields exactly 4n + 3 steps: n visits, n go-lefts, n go-rights, n + 1 null-children', () => {
        [[], [5], SMALL_TREE_VALUES, PERFECT_TREE_VALUES, [1, 2, 3, 4, 5], [5, 4, 3, 2, 1]].forEach((values) => {
            const n = values.length;
            const steps = collect(generatorFn(buildTree(values)));

            expect(steps).toHaveLength(4 * n + 3);
            expect(countPhase(steps, 'visit')).toBe(n);
            expect(countPhase(steps, 'go-left')).toBe(n);
            expect(countPhase(steps, 'go-right')).toBe(n);
            expect(countPhase(steps, 'null-child')).toBe(n + 1);
        });
    });

    test('visits every node exactly once, in the traversal-specific order', () => {
        const steps = collect(generatorFn(buildTree(PERFECT_TREE_VALUES)));
        expect(visitOrderOf(steps)).toEqual(EXPECTED_VISIT_ORDER[name]);
    });

    test('the final "done" message and highlights report the complete visit order', () => {
        const final = lastOf(collect(generatorFn(buildTree(PERFECT_TREE_VALUES))));
        const expected = EXPECTED_VISIT_ORDER[name];

        expect(final.message).toBe(`${label} traversal complete: ${expected.join(' \u2192 ')}`);
        expect(final.highlights).toEqual({ comparing: [], current: [], found: expected, order: expected });
    });

    test('on every "visit" step the visited node is amber, and it is the newest entry in both found and order', () => {
        collect(generatorFn(buildTree(PERFECT_TREE_VALUES)))
            .filter((step) => step.phase === 'visit')
            .forEach((step) => {
                const value = step.highlights.comparing[0];
                expect(step.highlights.comparing).toEqual([value]);
                expect(lastOf(step.highlights.found)).toBe(value);
                expect(lastOf(step.highlights.order)).toBe(value);
                expect(step.message).toContain(`Visit ${value}.`);
            });
    });

    test('found and order only ever grow (never shrink or reorder) across a run', () => {
        const steps = collect(generatorFn(buildTree(PERFECT_TREE_VALUES)));
        steps.forEach((step, i) => {
            if (i === 0) return;
            const previous = steps[i - 1].highlights;
            expect(step.highlights.found.slice(0, previous.found.length)).toEqual(previous.found);
            expect(step.highlights.order.slice(0, previous.order.length)).toEqual(previous.order);
        });
    });

    test('a node is never in both comparing and current (the active node is excluded from the stack list)', () => {
        collect(generatorFn(buildTree(PERFECT_TREE_VALUES))).forEach((step) => {
            step.highlights.comparing.forEach((value) => {
                expect(step.highlights.current).not.toContain(value);
            });
        });
    });

    test('every highlighted value is a real node in the tree', () => {
        const values = new Set(PERFECT_TREE_VALUES);
        collect(generatorFn(buildTree(PERFECT_TREE_VALUES))).forEach((step) => {
            ['comparing', 'current', 'found', 'order'].forEach((key) => {
                step.highlights[key].forEach((value) => expect(values.has(value)).toBe(true));
            });
        });
    });

    test('null-child steps blame the parent and name the empty side', () => {
        const steps = collect(generatorFn(buildTree([2, 1, 3])));
        const nullSteps = steps.filter((step) => step.phase === 'null-child');

        // Tree 2 -> (1, 3): four empty slots — 1.left, 1.right, 3.left, 3.right.
        expect(nullSteps.map((step) => step.message).sort()).toEqual([
            '1 has no left child — return',
            '1 has no right child — return',
            '3 has no left child — return',
            '3 has no right child — return',
        ]);
        nullSteps.forEach((step) => {
            expect(step.highlights.comparing).toHaveLength(1); // the parent, amber
        });
    });

    test('is lazy and pure: it never touches the DOM, even when fully drained', () => {
        document.getElementById('visualizer-container').innerHTML = '<span id="sentinel"></span>';
        const statusBefore = document.getElementById('status-bar').className;

        collect(generatorFn(buildTree(PERFECT_TREE_VALUES)));

        expect(document.getElementById('sentinel')).not.toBeNull();
        expect(document.getElementById('status-bar').className).toBe(statusBefore);
    });

    test('does not mutate the tree it walks', () => {
        const root = buildTree(PERFECT_TREE_VALUES);
        const before = JSON.stringify(root);

        collect(generatorFn(root));

        expect(JSON.stringify(root)).toBe(before);
    });

    test('is deterministic: the same tree always yields the same steps', () => {
        const root = buildTree(PERFECT_TREE_VALUES);
        expect(collect(generatorFn(root))).toEqual(collect(generatorFn(root)));
    });

    test('snapshots are independent copies (mutating one step never corrupts another)', () => {
        const steps = collect(generatorFn(buildTree(SMALL_TREE_VALUES)));
        const pristine = JSON.parse(JSON.stringify(steps));

        steps[2].highlights.found.push(999);
        steps[2].highlights.order.push(999);
        steps[2].highlights.current.push(999);

        steps.forEach((step, i) => {
            if (i === 2) return;
            expect(step).toEqual(pristine[i]);
        });
    });

    test('steps are plain, serialisable data (safe to cache and replay)', () => {
        const steps = collect(generatorFn(buildTree(PERFECT_TREE_VALUES)));
        expect(JSON.parse(JSON.stringify(steps))).toEqual(steps);
    });

    test('can be abandoned part-way through without throwing', () => {
        const generator = generatorFn(buildTree(PERFECT_TREE_VALUES));
        generator.next();
        generator.next();
        expect(() => generator.return()).not.toThrow();
        expect(generator.next()).toEqual({ value: undefined, done: true });
    });

    test('an empty tree (null root) yields start, one null-child, done — and never throws', () => {
        const steps = collect(generatorFn(null));

        expect(phasesOf(steps)).toEqual(['start', 'null-child', 'done']);
        expect(steps[0].message).toBe(`Starting ${label} traversal`);
        expect(steps[1].message).toBe('The tree is empty — nothing to traverse');
        expect(steps[2].message).toBe(`${label} traversal complete: `);
        expect(steps[2].highlights.order).toEqual([]);
    });

    test('a single-node tree visits just that node', () => {
        const steps = collect(generatorFn(buildTree([7])));
        expect(visitOrderOf(steps)).toEqual([7]);
        expect(lastOf(steps).message).toBe(`${label} traversal complete: 7`);
    });

    test('handles a degenerate (linked-list-shaped) tree in both directions', () => {
        const ascending = collect(generatorFn(buildTree([1, 2, 3, 4, 5])));
        const descending = collect(generatorFn(buildTree([5, 4, 3, 2, 1])));

        expect([...visitOrderOf(ascending)].sort()).toEqual([1, 2, 3, 4, 5]);
        expect([...visitOrderOf(descending)].sort()).toEqual([1, 2, 3, 4, 5]);
        expect(lastOf(ascending).phase).toBe('done');
        expect(lastOf(descending).phase).toBe('done');
    });

    test('handles zero and negative node values (0 is falsy, so a truthiness bug would hide here)', () => {
        const steps = collect(generatorFn(buildTree([0, -5, 5])));

        expect(visitOrderOf(steps).sort((a, b) => a - b)).toEqual([-5, 0, 5]);
        expect(countPhase(steps, 'visit')).toBe(3);
        expect(countPhase(steps, 'null-child')).toBe(4);
        steps.filter((step) => step.phase === 'visit').forEach((step) => {
            expect(step.highlights.comparing).toHaveLength(1); // 0 must still register as an active node
        });
    });
});

describe('tree traversal generators: exact phase sequences', () => {
    // Tree 2 -> (1, 3). These sequences are the contract the code panel's
    // lineMap depends on: each phase maps to one source line per language.
    const smallTree = () => buildTree(SMALL_TREE_VALUES);

    test('inorderSteps: go-left BEFORE visit, go-right AFTER visit (Left, Node, Right)', () => {
        expect(phasesOf(collect(inorderSteps(smallTree())))).toEqual([
            'start',
            'go-left', // at 2
            'go-left', // at 1
            'null-child', // 1 has no left child
            'visit', // 1
            'go-right',
            'null-child', // 1 has no right child
            'visit', // 2
            'go-right', // at 2
            'go-left', // at 3
            'null-child',
            'visit', // 3
            'go-right',
            'null-child',
            'done',
        ]);
    });

    test('preorderSteps: visit BEFORE go-left and go-right (Node, Left, Right)', () => {
        expect(phasesOf(collect(preorderSteps(smallTree())))).toEqual([
            'start',
            'visit', // 2
            'go-left',
            'visit', // 1
            'go-left',
            'null-child',
            'go-right',
            'null-child',
            'go-right', // at 2
            'visit', // 3
            'go-left',
            'null-child',
            'go-right',
            'null-child',
            'done',
        ]);
    });

    test('postorderSteps: visit AFTER go-left and go-right (Left, Right, Node)', () => {
        expect(phasesOf(collect(postorderSteps(smallTree())))).toEqual([
            'start',
            'go-left', // at 2
            'go-left', // at 1
            'null-child',
            'go-right',
            'null-child',
            'visit', // 1
            'go-right', // at 2
            'go-left', // at 3
            'null-child',
            'go-right',
            'null-child',
            'visit', // 3
            'visit', // 2
            'done',
        ]);
    });

    test('single-node tree: the three traversals differ only in where "visit" falls', () => {
        const root = buildTree([5]);
        expect(phasesOf(collect(inorderSteps(root)))).toEqual(['start', 'go-left', 'null-child', 'visit', 'go-right', 'null-child', 'done']);
        expect(phasesOf(collect(preorderSteps(root)))).toEqual(['start', 'visit', 'go-left', 'null-child', 'go-right', 'null-child', 'done']);
        expect(phasesOf(collect(postorderSteps(root)))).toEqual(['start', 'go-left', 'null-child', 'go-right', 'null-child', 'visit', 'done']);
    });

    test('perfect 7-node tree: first visit is 20 in-order, 50 pre-order, 20 post-order; post-order visits the root last', () => {
        const root = buildTree(PERFECT_TREE_VALUES);
        expect(visitOrderOf(collect(inorderSteps(root)))[0]).toBe(20);
        expect(visitOrderOf(collect(preorderSteps(root)))[0]).toBe(50);
        expect(visitOrderOf(collect(postorderSteps(root)))[0]).toBe(20);

        const postSteps = collect(postorderSteps(root));
        expect(postSteps[postSteps.length - 2].phase).toBe('visit');
        expect(postSteps[postSteps.length - 2].highlights.comparing).toEqual([50]);
    });

    test('in-order over a BST always yields ascending sorted values (any insertion order)', () => {
        const values = [8, 3, 10, 1, 6, 14, 4, 7, 13];
        const visited = visitOrderOf(collect(inorderSteps(buildTree(values))));
        expect(visited).toEqual([...values].sort((a, b) => a - b));
    });

    test('pre-order always visits a parent before either of its children; post-order always after both', () => {
        const values = [8, 3, 10, 1, 6, 14, 4, 7, 13];
        const root = buildTree(values);

        const parentOf = new Map();
        (function link(node) {
            [node.left, node.right].forEach((child) => {
                if (!child) return;
                parentOf.set(child.value, node.value);
                link(child);
            });
        })(root);

        const pre = visitOrderOf(collect(preorderSteps(root)));
        const post = visitOrderOf(collect(postorderSteps(root)));
        parentOf.forEach((parent, child) => {
            expect(pre.indexOf(parent)).toBeLessThan(pre.indexOf(child));
            expect(post.indexOf(parent)).toBeGreaterThan(post.indexOf(child));
        });
    });

    test('recursion-stack highlight: the deepest active node lists its ancestors (root first) as "current"', () => {
        const steps = collect(inorderSteps(buildTree(PERFECT_TREE_VALUES)));
        // Descending 50 -> 30 -> 20: at 20's first go-left, 50 and 30 are open frames above it.
        const atTwenty = steps.find((step) => step.phase === 'go-left' && step.highlights.comparing[0] === 20);

        expect(atTwenty.highlights.comparing).toEqual([20]);
        expect(atTwenty.highlights.current).toEqual([50, 30]);
        expect(atTwenty.highlights.found).toEqual([]);
    });

    test('go-left / go-right messages name the node being processed', () => {
        const steps = collect(inorderSteps(buildTree(SMALL_TREE_VALUES)));
        const goLeftAtRoot = steps.find((step) => step.phase === 'go-left' && step.highlights.comparing[0] === 2);
        const goRightAtRoot = steps.find((step) => step.phase === 'go-right' && step.highlights.comparing[0] === 2);

        expect(goLeftAtRoot.message).toBe('At 2: traverse the left subtree first');
        expect(goRightAtRoot.message).toBe('Back at 2: traverse the right subtree');
    });
});

describe('tree traversal generators: every phase resolves to a real code-panel line', () => {
    const CASES = [
        ['tree-inorder', inorderSteps],
        ['tree-preorder', preorderSteps],
        ['tree-postorder', postorderSteps],
    ];

    describe.each(CASES)('algorithmDatabase["%s"]', (id, generatorFn) => {
        const yielded = new Set(phasesOf(collect(generatorFn(buildTree(PERFECT_TREE_VALUES)))));

        test.each(['javascript', 'python', 'cpp'])('%s: every yielded phase is mapped to an in-bounds, non-blank line', (language) => {
            const codeLines = algorithmDatabase[id].code[language].split('\n');
            const map = algorithmDatabase[id].lineMap[language];

            yielded.forEach((phase) => {
                expect({ phase, mapped: phase in map }).toEqual({ phase, mapped: true });
                expect(map[phase]).toBeGreaterThanOrEqual(1);
                expect(map[phase]).toBeLessThanOrEqual(codeLines.length);
                expect(codeLines[map[phase] - 1].trim()).not.toBe('');
            });
        });

        test.each(['javascript', 'python', 'cpp'])('%s: no dead lineMap entries (every mapped phase is reachable)', (language) => {
            const mapped = Object.keys(algorithmDatabase[id].lineMap[language]).sort();
            expect(mapped).toEqual([...yielded].sort());
        });
    });
});

describe('tree traversal generators: how renderTree() draws their highlights', () => {
    const nodeValueOf = (g) => g.querySelector('text').textContent; // first <text> is the node value; a badge adds a second

    test('a mid-run step colors comparing/found/current nodes and numbers the visited ones', async () => {
        for (const v of SMALL_TREE_VALUES) await insertNode(v);
        // In-order, just after visiting 1: node 1 amber+visited, node 2 still open on the stack.
        const step = collect(inorderSteps(treeRoot)).find((s) => s.phase === 'visit' && s.highlights.comparing[0] === 1);

        renderTree(step.highlights);

        const comparing = [...document.querySelectorAll('.tree-node.comparing')];
        const found = [...document.querySelectorAll('.tree-node.found')];
        const current = [...document.querySelectorAll('.tree-node.current')];

        expect(comparing.map(nodeValueOf)).toEqual(['1']);
        expect(found).toHaveLength(0); // comparing wins over found for the same value
        expect(current.map(nodeValueOf)).toEqual(['2']);
        expect(document.querySelectorAll('.tree-node')).toHaveLength(3);
    });

    test('found nodes are green, and visit-order badges are numbered 1..n', async () => {
        for (const v of SMALL_TREE_VALUES) await insertNode(v);
        const done = lastOf(collect(inorderSteps(treeRoot)));

        renderTree(done.highlights);

        expect(document.querySelectorAll('.tree-node.found')).toHaveLength(3);
        expect(document.querySelectorAll('.tree-node.comparing')).toHaveLength(0);
        const badgeNumbers = [...document.querySelectorAll('.tree-node')]
            .map((g) => ({ value: nodeValueOf(g), badge: g.querySelectorAll('text')[1].textContent }))
            .sort((a, b) => Number(a.value) - Number(b.value));
        expect(badgeNumbers).toEqual([
            { value: '1', badge: '1' },
            { value: '2', badge: '2' },
            { value: '3', badge: '3' },
        ]);
    });

    test('the amber node is drawn larger than the rest (a non-color cue)', async () => {
        for (const v of SMALL_TREE_VALUES) await insertNode(v);

        renderTree({ comparing: [2] });

        const radii = [...document.querySelectorAll('.tree-node')].map((g) => ({
            value: nodeValueOf(g),
            r: Number(g.querySelector('circle').getAttribute('r')),
        }));
        expect(radii.find((n) => n.value === '2').r).toBeGreaterThan(radii.find((n) => n.value === '1').r);
    });

    test('a node with no highlight and no order entry has no badge', async () => {
        for (const v of SMALL_TREE_VALUES) await insertNode(v);

        renderTree();

        document.querySelectorAll('.tree-node').forEach((g) => {
            expect(g.querySelectorAll('text')).toHaveLength(1);
        });
    });

    test('rendering an empty-tree traversal frame falls back to the empty-state message', () => {
        const [start] = collect(inorderSteps(null));
        renderTree(start.highlights);
        expect(document.querySelector('.empty-structure-msg')).not.toBeNull();
        expect(document.querySelectorAll('.tree-node')).toHaveLength(0);
    });
});

// =====================================================================
// 4. GRAPH (undirected, BFS & DFS)
// =====================================================================

describe('graph: node/edge logic', () => {
    test('renderGraph() shows the empty-state message and tags the container graph-mode', () => {
        renderGraph();
        expect(document.querySelector('.empty-structure-msg')).not.toBeNull();
        expect(document.getElementById('visualizer-container').classList.contains('graph-mode')).toBe(true);
    });

    test('addNode(): accepts a new id, rejects a duplicate, trims whitespace', () => {
        expect(addNode('A')).toBe(true);
        expect(addNode('A')).toBe(false); // duplicate
        expect(addNode('  B  ')).toBe(true);
        expect(Object.keys(graphNodes).sort()).toEqual(['A', 'B']);
    });

    test('addNode(): rejects an empty or whitespace-only id', () => {
        expect(addNode('')).toBe(false);
        expect(addNode('   ')).toBe(false);
        expect(Object.keys(graphNodes)).toEqual([]);
    });

    test('addEdge(): accepts a valid edge between two existing nodes', () => {
        addNode('A');
        addNode('B');
        expect(addEdge('A', 'B')).toBe(true);
        expect(graphEdges).toEqual([['A', 'B']]);
    });

    test('addEdge(): rejects a duplicate in either direction', () => {
        addNode('A');
        addNode('B');
        addEdge('A', 'B');
        expect(addEdge('A', 'B')).toBe(false);
        expect(addEdge('B', 'A')).toBe(false); // same edge, reversed
        expect(graphEdges).toHaveLength(1);
    });

    test('addEdge(): rejects a self-loop', () => {
        addNode('A');
        expect(addEdge('A', 'A')).toBe(false);
        expect(graphEdges).toEqual([]);
    });

    test('addEdge(): rejects an edge to a node that does not exist', () => {
        addNode('A');
        expect(addEdge('A', 'Z')).toBe(false);
        expect(addEdge('Z', 'A')).toBe(false);
        expect(graphEdges).toEqual([]);
    });

    test('getNeighbors(): returns both directions of an undirected edge, sorted, and [] for an isolated node', () => {
        ['A', 'B', 'C'].forEach(addNode);
        addEdge('A', 'C');
        addEdge('A', 'B');

        expect(getNeighbors('A')).toEqual(['B', 'C']); // sorted, not insertion order
        expect(getNeighbors('B')).toEqual(['A']);
        expect(getNeighbors('C')).toEqual(['A']);
    });

    test('getNeighbors(): an isolated vertex (no edges at all) has no neighbors', () => {
        addNode('X');
        addNode('Y');
        addEdge('X', 'Y');
        addNode('Z'); // never connected to anything

        expect(getNeighbors('Z')).toEqual([]);
    });

    test('buildAdjacency(): snapshots every node (isolated ones included) with sorted neighbor lists', () => {
        buildDiamondGraph();
        addNode('Z'); // isolated

        expect(buildAdjacency()).toEqual({ ...DIAMOND_ADJACENCY, Z: [] });
    });

    test('buildAdjacency(): is a detached snapshot — later edits to the graph do not change an earlier one', () => {
        addNode('A');
        addNode('B');
        const snapshot = buildAdjacency();

        addEdge('A', 'B');

        expect(snapshot).toEqual({ A: [], B: [] });
        expect(buildAdjacency()).toEqual({ A: ['B'], B: ['A'] });
    });

    test('buildAdjacency() on an empty graph is an empty object', () => {
        expect(buildAdjacency()).toEqual({});
    });
});

// =====================================================================
// 4b. GRAPH TRAVERSAL GENERATORS (pure: no DOM, no timers, no app.js state)
// =====================================================================
// bfsSteps / dfsSteps take an adjacency object ({ id: [neighbors...] }, see
// buildAdjacency()) and a start id, and yield { phase, message, statusClass,
// highlights: { comparing, current, found, order, activeEdges, visitedEdges } }.

const GRAPH_GENERATORS = [
    ['bfsSteps', bfsSteps, 'BFS'],
    ['dfsSteps', dfsSteps, 'DFS'],
];

const EXPECTED_GRAPH_ORDER = {
    bfsSteps: ['A', 'B', 'C', 'D', 'E'],
    dfsSteps: ['A', 'B', 'D', 'C', 'E'],
};

const edgeKeyOf = (a, b) => [a, b].sort().join('|');
const DIAMOND_EDGE_KEYS = new Set(DIAMOND_EDGES.map(([a, b]) => edgeKeyOf(a, b)));

describe.each(GRAPH_GENERATORS)('%s: generator contract', (name, generatorFn, label) => {
    test('is a generator function that returns an iterator', () => {
        const generator = generatorFn(DIAMOND_ADJACENCY, 'A');
        expect(typeof generator.next).toBe('function');
        expect(generator[Symbol.iterator]()).toBe(generator);
        expect(Object.prototype.toString.call(generator)).toBe('[object Generator]');
    });

    test('every run starts with a "start" step in the "searching" state', () => {
        const steps = collect(generatorFn(DIAMOND_ADJACENCY, 'A'));
        expect(steps[0].phase).toBe('start');
        expect(steps[0].statusClass).toBe('searching');
        expect(steps[0].highlights.order).toEqual([]);
        expect(steps[0].highlights.found).toEqual([]);
    });

    test('every run ends with exactly one "done" step, reporting success and the full visit order', () => {
        const steps = collect(generatorFn(DIAMOND_ADJACENCY, 'A'));
        const expected = EXPECTED_GRAPH_ORDER[name];

        expect(countPhase(steps, 'done')).toBe(1);
        expect(lastOf(steps).phase).toBe('done');
        expect(lastOf(steps).statusClass).toBe('success');
        expect(lastOf(steps).message).toBe(`${label} complete: ${expected.join(' \u2192 ')}`);
        expect(lastOf(steps).highlights.order).toEqual(expected);
        expect(lastOf(steps).highlights.comparing).toEqual([]);
        expect(lastOf(steps).highlights.current).toEqual([]);
        expect([...lastOf(steps).highlights.found].sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    test('every step has the shape the app.js runner and renderGraph() expect', () => {
        collect(generatorFn(DIAMOND_ADJACENCY, 'A')).forEach((step) => {
            expect(typeof step.phase).toBe('string');
            expect(step.phase.length).toBeGreaterThan(0);
            expect(typeof step.message).toBe('string');
            expect(step.message.length).toBeGreaterThan(0);
            expect(['searching', 'success']).toContain(step.statusClass);
            ['comparing', 'current', 'found', 'order', 'activeEdges', 'visitedEdges'].forEach((key) => {
                expect(Array.isArray(step.highlights[key])).toBe(true);
            });
        });
    });

    test('visits every reachable node exactly once, in the traversal-specific order', () => {
        const steps = collect(generatorFn(DIAMOND_ADJACENCY, 'A'));
        expect(visitOrderOf(steps)).toEqual(EXPECTED_GRAPH_ORDER[name]);
    });

    test('on every "visit" step the visited node is amber and is the newest entry in order', () => {
        collect(generatorFn(DIAMOND_ADJACENCY, 'A'))
            .filter((step) => step.phase === 'visit')
            .forEach((step) => {
                const id = step.highlights.comparing[0];
                expect(step.highlights.comparing).toEqual([id]);
                expect(lastOf(step.highlights.order)).toBe(id);
                expect(step.message).toContain(`Visit ${id}`);
            });
    });

    test('order only ever grows (never shrinks or reorders) across a run', () => {
        const steps = collect(generatorFn(DIAMOND_ADJACENCY, 'A'));
        steps.forEach((step, i) => {
            if (i === 0) return;
            const previous = steps[i - 1].highlights.order;
            expect(step.highlights.order.slice(0, previous.length)).toEqual(previous);
        });
    });

    test('a node is never in more than one of comparing / current / found on the same step', () => {
        collect(generatorFn(DIAMOND_ADJACENCY, 'A')).forEach((step) => {
            const { comparing, current, found } = step.highlights;
            const all = [...comparing, ...current, ...found];
            expect(new Set(all).size).toBe(all.length);
        });
    });

    test('every highlighted id and edge is real: nodes exist and edges are actual graph edges', () => {
        const ids = new Set(Object.keys(DIAMOND_ADJACENCY));
        collect(generatorFn(DIAMOND_ADJACENCY, 'A')).forEach((step) => {
            ['comparing', 'current', 'found', 'order'].forEach((key) => {
                step.highlights[key].forEach((id) => expect(ids.has(id)).toBe(true));
            });
            [...step.highlights.activeEdges, ...step.highlights.visitedEdges].forEach(([a, b]) => {
                expect(DIAMOND_EDGE_KEYS.has(edgeKeyOf(a, b))).toBe(true);
            });
        });
    });

    test('active edges only ever appear on check-neighbor / enqueue / recurse steps, and are one edge at a time', () => {
        collect(generatorFn(DIAMOND_ADJACENCY, 'A')).forEach((step) => {
            if (['check-neighbor', 'enqueue', 'recurse'].includes(step.phase)) {
                expect(step.highlights.activeEdges).toHaveLength(1);
            } else {
                expect(step.highlights.activeEdges).toEqual([]);
            }
        });
    });

    test('visitedEdges (discovery edges) form a spanning tree of the reachable nodes: n - 1 edges, never shrinking', () => {
        const steps = collect(generatorFn(DIAMOND_ADJACENCY, 'A'));
        const finalEdges = lastOf(steps).highlights.visitedEdges;

        expect(finalEdges).toHaveLength(Object.keys(DIAMOND_ADJACENCY).length - 1);
        expect(new Set(finalEdges.map(([a, b]) => edgeKeyOf(a, b))).size).toBe(finalEdges.length);

        steps.forEach((step, i) => {
            if (i === 0) return;
            expect(step.highlights.visitedEdges.length).toBeGreaterThanOrEqual(steps[i - 1].highlights.visitedEdges.length);
        });
    });

    test('is pure and lazy: it never touches the DOM, even when fully drained', () => {
        document.getElementById('visualizer-container').innerHTML = '<span id="sentinel"></span>';
        const statusBefore = document.getElementById('status-bar').className;

        collect(generatorFn(DIAMOND_ADJACENCY, 'A'));

        expect(document.getElementById('sentinel')).not.toBeNull();
        expect(document.getElementById('status-bar').className).toBe(statusBefore);
    });

    test('does not mutate the adjacency it is given (a deeply frozen input is accepted)', () => {
        const frozen = deepFreezeAdjacency({
            A: ['B', 'C'],
            B: ['A', 'D'],
            C: ['A', 'D'],
            D: ['B', 'C', 'E'],
            E: ['D'],
        });
        expect(() => collect(generatorFn(frozen, 'A'))).not.toThrow();
        expect(frozen).toEqual(DIAMOND_ADJACENCY);
    });

    test('is deterministic: the same graph and start always yield the same steps', () => {
        expect(collect(generatorFn(DIAMOND_ADJACENCY, 'A'))).toEqual(collect(generatorFn(DIAMOND_ADJACENCY, 'A')));
    });

    test('snapshots are independent copies (mutating one step never corrupts another)', () => {
        const steps = collect(generatorFn(DIAMOND_ADJACENCY, 'A'));
        const pristine = JSON.parse(JSON.stringify(steps));

        steps[3].highlights.order.push('ZZ');
        steps[3].highlights.found.push('ZZ');
        steps[3].highlights.current.push('ZZ');
        steps[3].highlights.activeEdges.push(['ZZ', 'ZZ']);
        steps[3].highlights.visitedEdges.push(['ZZ', 'ZZ']);
        if (steps[4].highlights.visitedEdges[0]) steps[4].highlights.visitedEdges[0][0] = 'ZZ';

        steps.forEach((step, i) => {
            if (i === 3 || i === 4) return;
            expect(step).toEqual(pristine[i]);
        });
    });

    test('steps are plain, serialisable data (safe to cache and replay)', () => {
        const steps = collect(generatorFn(DIAMOND_ADJACENCY, 'A'));
        expect(JSON.parse(JSON.stringify(steps))).toEqual(steps);
    });

    test('can be abandoned part-way through without throwing', () => {
        const generator = generatorFn(DIAMOND_ADJACENCY, 'A');
        generator.next();
        generator.next();
        expect(() => generator.return()).not.toThrow();
        expect(generator.next()).toEqual({ value: undefined, done: true });
    });

    test('start from any node works and only visits that node once', () => {
        Object.keys(DIAMOND_ADJACENCY).forEach((start) => {
            const order = visitOrderOf(collect(generatorFn(DIAMOND_ADJACENCY, start)));
            expect(order[0]).toBe(start);
            expect([...order].sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
        });
    });

    test('every node visits exactly once, even on a graph with a cycle', () => {
        const triangle = { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] };
        const steps = collect(generatorFn(triangle, 'A'));
        const order = lastOf(steps).highlights.order;

        expect(order).toHaveLength(3);
        expect(new Set(order).size).toBe(3); // no repeats despite the cycle
        expect(steps.filter((s) => s.phase === 'check-neighbor' && s.message.includes('already visited')).length).toBeGreaterThan(0);
    });

    test('an isolated vertex visits only that vertex', () => {
        const steps = collect(generatorFn({ X: [] }, 'X'));
        expect(visitOrderOf(steps)).toEqual(['X']);
        expect(lastOf(steps).message).toBe(`${label} complete: X`);
    });

    test('a disconnected component is never reached, and the "done" message says so', () => {
        const adjacency = { A: ['B'], B: ['A'], C: [], D: [] }; // C and D unreachable from A
        const steps = collect(generatorFn(adjacency, 'A'));

        expect(lastOf(steps).message).toBe(`${label} complete: A \u2192 B (2 of 4 nodes reachable from A)`);
        expect(lastOf(steps).highlights.order).toEqual(['A', 'B']);
    });

    test('works on a real graph built with addNode()/addEdge() via buildAdjacency()', () => {
        buildDiamondGraph();
        const steps = collect(generatorFn(buildAdjacency(), 'A'));
        expect(visitOrderOf(steps)).toEqual(EXPECTED_GRAPH_ORDER[name]);
    });

    test('check-neighbor messages say whether the neighbor is new or already visited', () => {
        const steps = collect(generatorFn({ A: ['B'], B: ['A'] }, 'A'));
        const checks = steps.filter((step) => step.phase === 'check-neighbor').map((step) => step.message);

        expect(checks).toEqual([
            'Checking B (neighbor of A): not visited yet',
            'Checking A (neighbor of B): already visited \u2014 skip',
        ]);
    });
});

describe('graph traversal generators: exact phase sequences', () => {
    test('bfsSteps on the diamond graph', () => {
        expect(phasesOf(collect(bfsSteps(DIAMOND_ADJACENCY, 'A')))).toEqual([
            'start',
            // A: neighbors B (new), C (new)
            'dequeue', 'visit', 'check-neighbor', 'enqueue', 'check-neighbor', 'enqueue',
            // B: neighbors A (seen), D (new)
            'dequeue', 'visit', 'check-neighbor', 'check-neighbor', 'enqueue',
            // C: neighbors A (seen), D (seen)
            'dequeue', 'visit', 'check-neighbor', 'check-neighbor',
            // D: neighbors B (seen), C (seen), E (new)
            'dequeue', 'visit', 'check-neighbor', 'check-neighbor', 'check-neighbor', 'enqueue',
            // E: neighbor D (seen)
            'dequeue', 'visit', 'check-neighbor',
            'done',
        ]);
    });

    test('dfsSteps on the diamond graph', () => {
        expect(phasesOf(collect(dfsSteps(DIAMOND_ADJACENCY, 'A')))).toEqual([
            'start',
            'visit', 'check-neighbor', 'recurse', // A -> B
            'visit', 'check-neighbor', 'check-neighbor', 'recurse', // B: A (seen), D (new) -> D
            'visit', 'check-neighbor', 'check-neighbor', 'recurse', // D: B (seen), C (new) -> C
            'visit', 'check-neighbor', 'check-neighbor', 'backtrack', // C: A (seen), D (seen); done
            'check-neighbor', 'recurse', // back in D: E (new)
            'visit', 'check-neighbor', 'backtrack', // E: D (seen); done
            'backtrack', // D done
            'backtrack', // B done
            'check-neighbor', // back in A: C (already visited)
            'backtrack', // A done
            'done',
        ]);
    });

    test('isolated vertex: BFS is start, dequeue, visit, done; DFS is start, visit, backtrack, done', () => {
        expect(phasesOf(collect(bfsSteps({ X: [] }, 'X')))).toEqual(['start', 'dequeue', 'visit', 'done']);
        expect(phasesOf(collect(dfsSteps({ X: [] }, 'X')))).toEqual(['start', 'visit', 'backtrack', 'done']);
    });

    test('BFS only ever yields the six documented phases; DFS only ever yields its six', () => {
        expect([...new Set(phasesOf(collect(bfsSteps(DIAMOND_ADJACENCY, 'A'))))].sort()).toEqual([
            'check-neighbor', 'dequeue', 'done', 'enqueue', 'start', 'visit',
        ]);
        expect([...new Set(phasesOf(collect(dfsSteps(DIAMOND_ADJACENCY, 'A'))))].sort()).toEqual([
            'backtrack', 'check-neighbor', 'done', 'recurse', 'start', 'visit',
        ]);
    });
});

describe('bfsSteps: queue behavior', () => {
    test('the start node is enqueued (blue) before anything is dequeued', () => {
        const [start, dequeueStep] = collect(bfsSteps(DIAMOND_ADJACENCY, 'A'));

        expect(start.highlights.current).toEqual(['A']);
        expect(start.message).toBe('Start at A: mark it visited and enqueue it. Queue: [A]');
        expect(dequeueStep.phase).toBe('dequeue');
        expect(dequeueStep.highlights.comparing).toEqual(['A']);
        expect(dequeueStep.highlights.current).toEqual([]); // A left the queue
        expect(dequeueStep.message).toBe('Dequeue A from the front. Queue: []');
    });

    test('dequeues in FIFO order: same nodes in the same order they were enqueued', () => {
        const steps = collect(bfsSteps(DIAMOND_ADJACENCY, 'A'));
        const dequeued = steps.filter((s) => s.phase === 'dequeue').map((s) => s.highlights.comparing[0]);
        const enqueued = steps.filter((s) => s.phase === 'enqueue').map((s) => s.message.match(/^Mark (\w+) /)[1]);

        expect(dequeued).toEqual(['A', ...enqueued]); // the start, then everything discovered, in discovery order
    });

    test('an enqueue step turns the new neighbor blue and marks the discovery edge green', () => {
        const steps = collect(bfsSteps({ A: ['B'], B: ['A'] }, 'A'));
        const enqueueStep = steps.find((s) => s.phase === 'enqueue');

        expect(enqueueStep.highlights.comparing).toEqual(['A']);
        expect(enqueueStep.highlights.current).toEqual(['B']);
        expect(enqueueStep.highlights.activeEdges).toEqual([['A', 'B']]);
        expect(enqueueStep.highlights.visitedEdges).toEqual([['A', 'B']]);
        expect(enqueueStep.message).toBe('Mark B visited and enqueue it. Queue: [B]');
    });

    test('a node turns green only after all its neighbors were scanned (fully processed)', () => {
        const steps = collect(bfsSteps({ A: ['B'], B: ['A'] }, 'A'));
        const visitA = steps.find((s) => s.phase === 'visit' && s.highlights.comparing[0] === 'A');
        const dequeueB = steps.find((s) => s.phase === 'dequeue' && s.highlights.comparing[0] === 'B');

        expect(visitA.highlights.found).toEqual([]); // A is being processed, not yet finished
        expect(dequeueB.highlights.found).toEqual(['A']); // finished once B is picked up
    });

    test('finds the shortest path by edge count: level order visits distance-1 nodes before distance-2 nodes', () => {
        // Path graph with a shortcut: S-A, S-B, A-C, B-C, C-D. Distances: S=0, A=B=1, C=2, D=3.
        const adjacency = { S: ['A', 'B'], A: ['C', 'S'], B: ['C', 'S'], C: ['A', 'B', 'D'], D: ['C'] };
        const order = visitOrderOf(collect(bfsSteps(adjacency, 'S')));

        expect(order).toEqual(['S', 'A', 'B', 'C', 'D']);
    });
});

describe('dfsSteps: recursion-stack behavior', () => {
    test('going deeper turns ancestors blue: at D (reached via A -> B) the open frames are A and B', () => {
        const steps = collect(dfsSteps(DIAMOND_ADJACENCY, 'A'));
        const visitD = steps.find((s) => s.phase === 'visit' && s.highlights.comparing[0] === 'D');

        expect(visitD.highlights.comparing).toEqual(['D']);
        expect(visitD.highlights.current).toEqual(['A', 'B']);
        expect(visitD.highlights.found).toEqual([]);
    });

    test('a recurse step announces the edge being followed and marks it as a discovery edge', () => {
        const steps = collect(dfsSteps({ A: ['B'], B: ['A'] }, 'A'));
        const recurse = steps.find((s) => s.phase === 'recurse');

        expect(recurse.message).toBe('Go deeper: A \u2192 B');
        expect(recurse.highlights.activeEdges).toEqual([['A', 'B']]);
        expect(recurse.highlights.visitedEdges).toEqual([['A', 'B']]);
        expect(recurse.highlights.comparing).toEqual(['A']);
    });

    test('backtracking turns a finished node green and hands the amber highlight back to its parent', () => {
        const steps = collect(dfsSteps({ A: ['B'], B: ['A'] }, 'A'));
        const backtracks = steps.filter((s) => s.phase === 'backtrack');

        expect(backtracks[0].message).toBe('B is finished \u2014 backtrack to A');
        expect(backtracks[0].highlights.comparing).toEqual(['A']);
        expect(backtracks[0].highlights.found).toEqual(['B']);
        expect(backtracks[0].highlights.current).toEqual([]);

        expect(backtracks[1].message).toBe('A is finished \u2014 no unvisited neighbors left');
        expect(backtracks[1].highlights.comparing).toEqual([]);
        expect(backtracks[1].highlights.found).toEqual(['B', 'A']); // post-order of completion
    });

    test('one backtrack per visited node, and one recurse per discovery edge', () => {
        const steps = collect(dfsSteps(DIAMOND_ADJACENCY, 'A'));

        expect(countPhase(steps, 'backtrack')).toBe(5);
        expect(countPhase(steps, 'recurse')).toBe(4); // 5 nodes -> 4 discovery edges
    });

    test('goes as deep as possible before branching: on a path graph A-B-C-D the visit order is the path', () => {
        const path = { A: ['B'], B: ['A', 'C'], C: ['B', 'D'], D: ['C'] };
        const steps = collect(dfsSteps(path, 'A'));

        expect(visitOrderOf(steps)).toEqual(['A', 'B', 'C', 'D']);
        const visitD = steps.find((s) => s.phase === 'visit' && s.highlights.comparing[0] === 'D');
        expect(visitD.highlights.current).toEqual(['A', 'B', 'C']); // the whole path is on the stack
    });

    test('nodes finish in reverse discovery order along a path (last in, first out)', () => {
        const path = { A: ['B'], B: ['A', 'C'], C: ['B'] };
        const final = lastOf(collect(dfsSteps(path, 'A')));

        expect(final.highlights.order).toEqual(['A', 'B', 'C']); // discovery order
        expect(final.highlights.found).toEqual(['C', 'B', 'A']); // finish order
    });
});

describe('graph traversal generators: every phase resolves to a real code-panel line', () => {
    const CASES = [
        ['graph-bfs', bfsSteps],
        ['graph-dfs', dfsSteps],
    ];

    describe.each(CASES)('algorithmDatabase["%s"]', (id, generatorFn) => {
        const yielded = new Set(phasesOf(collect(generatorFn(DIAMOND_ADJACENCY, 'A'))));

        test.each(['javascript', 'python', 'cpp'])('%s: every yielded phase is mapped to an in-bounds, non-blank line', (language) => {
            const codeLines = algorithmDatabase[id].code[language].split('\n');
            const map = algorithmDatabase[id].lineMap[language];

            yielded.forEach((phase) => {
                expect({ phase, mapped: phase in map }).toEqual({ phase, mapped: true });
                expect(map[phase]).toBeGreaterThanOrEqual(1);
                expect(map[phase]).toBeLessThanOrEqual(codeLines.length);
                expect(codeLines[map[phase] - 1].trim()).not.toBe('');
            });
        });

        test.each(['javascript', 'python', 'cpp'])('%s: no dead lineMap entries (every mapped phase is reachable)', (language) => {
            const mapped = Object.keys(algorithmDatabase[id].lineMap[language]).sort();
            expect(mapped).toEqual([...yielded].sort());
        });
    });
});

describe('graph traversal generators: how renderGraph() draws their highlights', () => {
    const nodeIdOf = (g) => g.querySelector('text').textContent; // first <text> is the node id; a badge adds a second

    // A-B-C path plus the diamond's shape isn't needed: three nodes are enough to see every state.
    function buildPathGraph() {
        ['A', 'B', 'C'].forEach(addNode);
        addEdge('A', 'B');
        addEdge('B', 'C');
    }

    test('a mid-run BFS step colors amber / queued-blue / finished-green nodes and numbers visited ones', () => {
        buildPathGraph();
        const steps = collect(bfsSteps(buildAdjacency(), 'A'));
        // After B is enqueued from A: A is amber (processing), B is blue (queued).
        const step = steps.find((s) => s.phase === 'enqueue');

        renderGraph(step.highlights);

        expect([...document.querySelectorAll('.graph-node.comparing')].map(nodeIdOf)).toEqual(['A']);
        expect([...document.querySelectorAll('.graph-node.current')].map(nodeIdOf)).toEqual(['B']);
        expect(document.querySelectorAll('.graph-node.found')).toHaveLength(0);
        expect(document.querySelectorAll('.graph-node')).toHaveLength(3);
    });

    test('a finished run leaves every node green and numbered in visit order', () => {
        buildPathGraph();
        const done = lastOf(collect(dfsSteps(buildAdjacency(), 'A')));

        renderGraph(done.highlights);

        expect(document.querySelectorAll('.graph-node.found')).toHaveLength(3);
        expect(document.querySelectorAll('.graph-node.comparing')).toHaveLength(0);
        const badges = [...document.querySelectorAll('.graph-node')]
            .map((g) => ({ id: nodeIdOf(g), badge: g.querySelectorAll('text')[1].textContent }))
            .sort((a, b) => a.id.localeCompare(b.id));
        expect(badges).toEqual([
            { id: 'A', badge: '1' },
            { id: 'B', badge: '2' },
            { id: 'C', badge: '3' },
        ]);
    });

    test('the amber node is drawn larger than the rest (a non-color cue)', () => {
        buildPathGraph();

        renderGraph({ comparing: ['B'] });

        const radii = [...document.querySelectorAll('.graph-node')].map((g) => ({
            id: nodeIdOf(g),
            r: Number(g.querySelector('circle').getAttribute('r')),
        }));
        expect(radii.find((n) => n.id === 'B').r).toBeGreaterThan(radii.find((n) => n.id === 'A').r);
    });

    test('every graph edge is still drawn while edges are highlighted (highlighting never adds or drops lines)', () => {
        buildPathGraph();

        renderGraph({ activeEdges: [['B', 'A']], visitedEdges: [['B', 'C']] }); // reversed pairs: matching is undirected

        expect(document.querySelectorAll('.graph-edge')).toHaveLength(2);
    });

    test('a node with no highlight and no order entry has no badge', () => {
        buildPathGraph();

        renderGraph();

        document.querySelectorAll('.graph-node').forEach((g) => {
            expect(g.querySelectorAll('text')).toHaveLength(1);
        });
    });
});

describe('graph: generateRandomGraph()', () => {
    test('always produces exactly the 6 labeled nodes A-F, fully connected, with 5 to 7 edges', async () => {
        for (let trial = 0; trial < 20; trial++) {
            resetGraph();
            await generateRandomGraph();

            expect(Object.keys(graphNodes).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
            expect(graphEdges.length).toBeGreaterThanOrEqual(5); // at least a spanning tree
            expect(graphEdges.length).toBeLessThanOrEqual(7); // spanning tree (5) + at most 2 extra

            // Connectivity: BFS from A (via a plain reachability walk, not the
            // generator) must reach all 6 nodes.
            const visited = new Set(['A']);
            const queue = ['A'];
            while (queue.length) {
                const current = queue.shift();
                for (const neighbor of getNeighbors(current)) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            expect(visited.size).toBe(6);
        }
    });

    test('every random graph is fully traversable: bfsSteps and dfsSteps both reach all 6 nodes', async () => {
        for (let trial = 0; trial < 20; trial++) {
            resetGraph();
            await generateRandomGraph();
            const adjacency = buildAdjacency();

            [bfsSteps, dfsSteps].forEach((generatorFn) => {
                const steps = collect(generatorFn(adjacency, 'A'));
                expect([...lastOf(steps).highlights.order].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
                expect(lastOf(steps).message).not.toContain('reachable from');
            });
        }
    });

    test('reports success once finished', async () => {
        await generateRandomGraph();
        expect(statusText()).toBe('Generated a random graph');
        expect(statusClass()).toBe('status-message success');
    });
});

describe('graph: clearGraph() / resetGraph()', () => {
    test('clearGraph() empties both nodes and edges, and hides the status bar', () => {
        ['A', 'B'].forEach(addNode);
        addEdge('A', 'B');

        clearGraph();

        expect(graphNodes).toEqual({});
        expect(graphEdges).toEqual([]);
        expect(document.querySelector('.empty-structure-msg')).not.toBeNull();
        expect(statusClass()).toBe('status-message hidden');
    });

    test('clearGraph() bumps the workspace generation, so an in-flight app.js traversal run is orphaned', () => {
        ['A', 'B'].forEach(addNode);
        const before = workspaceGeneration;

        clearGraph();

        expect(workspaceGeneration).toBe(before + 1);
    });

    test('a traversal snapshot taken before clearGraph() is unaffected by the clear (it holds its own adjacency)', () => {
        buildDiamondGraph();
        const adjacency = buildAdjacency();

        clearGraph();

        expect(visitOrderOf(collect(bfsSteps(adjacency, 'A')))).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    test('resetGraph() empties nodes and edges WITHOUT rendering (app.js calls it when opening a workspace)', () => {
        buildDiamondGraph();
        const htmlBefore = document.getElementById('visualizer-container').innerHTML;

        resetGraph();

        expect(graphNodes).toEqual({});
        expect(graphEdges).toEqual([]);
        expect(document.getElementById('visualizer-container').innerHTML).toBe(htmlBefore); // no re-render
    });
});

// =====================================================================
// 5. MODULE BOUNDARY (ES-module architecture)
// =====================================================================
// The structure files export only structure logic, render functions, state
// resets, and pure generators. The animated runners that drive those
// generators — and everything that touches the code panel — live in app.js.

describe('structure modules: UI runners live in app.js, not here', () => {
    test('tree.js exports the generators and resets, but no runner', () => {
        expect(typeof treeModule.inorderSteps).toBe('function');
        expect(typeof treeModule.preorderSteps).toBe('function');
        expect(typeof treeModule.postorderSteps).toBe('function');
        expect(typeof treeModule.resetTree).toBe('function');
        expect(treeModule.runTraversal).toBeUndefined();
        expect(treeModule.activateTreeCodePanel).toBeUndefined();
    });

    test('graph.js exports the generators and resets, but no runner', () => {
        expect(typeof graphModule.bfsSteps).toBe('function');
        expect(typeof graphModule.dfsSteps).toBe('function');
        expect(typeof graphModule.resetGraph).toBe('function');
        expect(graphModule.bfsTraversal).toBeUndefined();
        expect(graphModule.dfsTraversal).toBeUndefined();
        expect(graphModule.runGraphTraversal).toBeUndefined();
        expect(graphModule.activateGraphCodePanel).toBeUndefined();
    });

    test('all five traversal exports are real generator functions', () => {
        [inorderSteps, preorderSteps, postorderSteps, bfsSteps, dfsSteps].forEach((generatorFn) => {
            expect(Object.prototype.toString.call(generatorFn)).toBe('[object GeneratorFunction]');
        });
    });
});
