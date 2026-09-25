/** @jest-environment jsdom */
// ==========================================
// STRUCTURE ENGINE TESTS (test/dom/structures.test.js)
// ==========================================
// Covers the four live/persistent structure engines: stack.js, queue.js,
// tree.js (Binary Search Tree) and graph.js. Unlike the pure generators in
// test/unit/, every one of these mutates the DOM directly (renderStack(),
// renderTree(), ...) and several use real timing (stack/queue hardcode a
// 300ms sleep matching the CSS pop/dequeue transition; tree/graph use
// sleep(getSpeed())) — so, like test/dom/stepplayer.test.js, this runs under
// jest-environment-jsdom with a real #visualizer-container and #status-bar.
//
// Two timing strategies, chosen per module and verified empirically before
// being relied on:
//   - stack/queue's popFromStack()/dequeue() hardcode `sleep(300)` (it's tied
//     to a fixed CSS transition, not getSpeed()), so fake timers are the only
//     way to test them without a real 300ms wait per test. The pattern —
//     start the call, advanceTimersByTime, then await the promise — is the
//     same one already proven in test/dom/stepplayer.test.js.
//   - tree/graph's animated operations use `sleep(getSpeed())`, so instead of
//     fake timers (which get awkward across their loops/recursion) this file
//     just sets a real, tiny speed via setSpeed(0) and awaits normally — the
//     same approach used to validate these modules' behavior during
//     development, confirmed fast and reliable here too.
//
// Every BFS/DFS order and every cancellation-timing example below was run
// against the real generator/module first to confirm the exact expected
// output, not hand-derived from reading the source.

import { bumpWorkspaceGeneration, setSpeed, sleep } from '../../js/visualizer.js';
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
    runTraversal,
    clearTree,
} from '../../js/structures/tree.js';
import {
    graphNodes,
    graphEdges,
    getNeighbors,
    addNode,
    addEdge,
    renderGraph,
    bfsTraversal,
    dfsTraversal,
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
    setSpeed(0); // tree/graph animated ops use real timers at effectively-zero delay
});

afterEach(() => {
    jest.useRealTimers();
});

const statusText = () => document.getElementById('status-bar').innerText;
const statusClass = () => document.getElementById('status-bar').className;
const isDisabled = (id) => document.getElementById(id).disabled;
const blockTexts = () => [...document.querySelectorAll('.array-block')].map((el) => el.innerText);

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
        function buildTree(values) {
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
            const root = buildTree([50, 30, 70]);
            const before = JSON.stringify(root);
            const after = deleteFromTree(root, 999);
            expect(JSON.stringify(after)).toBe(before);
        });

        test('deleting a leaf removes it and nothing else', () => {
            const root = buildTree([50, 30, 70, 20]);
            const after = deleteFromTree(root, 20);
            expect(inOrder(after)).toEqual([30, 50, 70]);
            expect(after.left.left).toBeNull();
        });

        test('deleting a node with one child promotes that child', () => {
            const root = buildTree([50, 30, 70, 20]); // 30 has only a left child (20)
            const after = deleteFromTree(root, 30);
            expect(inOrder(after)).toEqual([20, 50, 70]);
            expect(after.left.value).toBe(20);
        });

        test('deleting a node with two children replaces it with its in-order successor', () => {
            const root = buildTree([50, 30, 70, 60, 80]); // 70 has two children; successor is 80's... actually 80 has no left, successor of 70 is 80? verify: right subtree of 70 is 80 only (60 is LEFT of 70) — successor = min(right subtree) = 80
            const after = deleteFromTree(root, 70);
            expect(inOrder(after)).toEqual([30, 50, 60, 80]);
            expect(after.right.value).toBe(80); // 70 replaced by 80 in place
            expect(after.right.right).toBeNull(); // 80's old slot is now empty
        });

        test('deleting the root with two children keeps the tree a valid BST', () => {
            const root = buildTree([50, 30, 70, 20, 40, 60, 80]);
            const after = deleteFromTree(root, 50);
            expect(inOrder(after)).toEqual([20, 30, 40, 60, 70, 80]);
            expect(after.value).toBe(60); // successor: min of the original right subtree
        });

        test('deleting every node one at a time empties the tree correctly', () => {
            let root = buildTree([5, 3, 8, 1, 4, 7, 9]);
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
        // Unlike runTraversal(), deleteNode() has no upfront `if (!treeRoot)` check — an
        // empty tree just falls through the normal walk-and-fail-to-find path, so the
        // message is the generic "not found", not a dedicated "tree is empty" one.
        await deleteNode(5);
        expect(statusText()).toBe('5 not found — nothing to delete');
    });

    test('runTraversal(): in-order, pre-order and post-order all report the correct sequence', async () => {
        for (const v of [50, 30, 70, 20, 40, 60, 80]) await insertNode(v);

        await runTraversal('inorder');
        expect(statusText()).toBe('Inorder traversal complete: 20 → 30 → 40 → 50 → 60 → 70 → 80');

        await runTraversal('preorder');
        expect(statusText()).toBe('Preorder traversal complete: 50 → 30 → 20 → 40 → 70 → 60 → 80');

        await runTraversal('postorder');
        expect(statusText()).toBe('Postorder traversal complete: 20 → 40 → 30 → 60 → 80 → 70 → 50');
    });

    test('runTraversal() on an empty tree reports an error and does not touch the DOM tree render', async () => {
        await runTraversal('inorder');
        expect(statusText()).toBe('Tree is empty — nothing to traverse');
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
});

describe('graph: BFS / DFS traversal', () => {
    // Diamond A-B-C-D with a D-E tail:  A-B, A-C, B-D, C-D, D-E
    function buildDiamondGraph() {
        ['A', 'B', 'C', 'D', 'E'].forEach(addNode);
        [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E']].forEach(([u, v]) => addEdge(u, v));
    }

    test('bfsTraversal(): visits level by level in sorted-neighbor order', async () => {
        buildDiamondGraph();
        await bfsTraversal('A');
        expect(statusText()).toBe('BFS order: A → B → C → D → E');
        expect(statusClass()).toBe('status-message success');
    });

    test('dfsTraversal(): visits depth-first in sorted-neighbor order', async () => {
        buildDiamondGraph();
        await dfsTraversal('A');
        expect(statusText()).toBe('DFS order: A → B → D → C → E');
    });

    test('bfsTraversal() and dfsTraversal() on an isolated vertex visit only that vertex', async () => {
        addNode('X');
        await bfsTraversal('X');
        expect(statusText()).toBe('BFS order: X');

        resetGraph();
        addNode('X');
        await dfsTraversal('X');
        expect(statusText()).toBe('DFS order: X');
    });

    test('a disconnected component is never reached', async () => {
        ['A', 'B', 'C', 'D'].forEach(addNode);
        addEdge('A', 'B'); // C and D are in a separate, unreached component

        await bfsTraversal('A');
        expect(statusText()).toBe('BFS order: A → B');

        resetGraph();
        ['A', 'B', 'C', 'D'].forEach(addNode);
        addEdge('A', 'B');
        await dfsTraversal('A');
        expect(statusText()).toBe('DFS order: A → B');
    });

    test('traversal from a node that does not exist reports an error, not an exception', async () => {
        addNode('A');
        await bfsTraversal('Q');
        expect(statusText()).toBe(`Node Q doesn't exist`);
        expect(statusClass()).toBe('status-message error');

        await dfsTraversal('Q');
        expect(statusText()).toBe(`Node Q doesn't exist`);
    });

    test('every node visits exactly once, even on a graph with a cycle', async () => {
        ['A', 'B', 'C'].forEach(addNode);
        addEdge('A', 'B');
        addEdge('B', 'C');
        addEdge('A', 'C'); // closes a triangle

        await bfsTraversal('A');
        const order = statusText().replace('BFS order: ', '').split(' → ');
        expect(order).toHaveLength(3);
        expect(new Set(order).size).toBe(3); // no repeats despite the cycle
    });

    test('a second traversal started while one is already running is dropped (graphBusy guard)', async () => {
        setSpeed(20);
        buildDiamondGraph();

        const first = bfsTraversal('A');
        const second = bfsTraversal('A'); // graphBusy already true

        await Promise.all([first, second]);
        expect(statusText()).toBe('BFS order: A → B → C → D → E'); // completed exactly once
    });

    test('leaving the workspace mid-BFS stops it before it finishes or reports success', async () => {
        setSpeed(20);
        ['A', 'B', 'C'].forEach(addNode);
        addEdge('A', 'B');
        addEdge('B', 'C');

        const pending = bfsTraversal('A');
        await sleep(5); // let it render the first "Starting..." step
        bumpWorkspaceGeneration();
        await pending;

        expect(statusClass()).not.toBe('status-message success'); // never reached the finish line
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
            // animated bfsTraversal) must reach all 6 nodes.
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

    test('reports success once finished', async () => {
        await generateRandomGraph();
        expect(statusText()).toBe('Generated a random graph');
        expect(statusClass()).toBe('status-message success');
    });
});

describe('graph: clearGraph()', () => {
    test('empties both nodes and edges, and hides the status bar', () => {
        ['A', 'B'].forEach(addNode);
        addEdge('A', 'B');

        clearGraph();

        expect(graphNodes).toEqual({});
        expect(graphEdges).toEqual([]);
        expect(document.querySelector('.empty-structure-msg')).not.toBeNull();
        expect(statusClass()).toBe('status-message hidden');
    });

    test('cancels a pending traversal and frees the lock for the next one', async () => {
        setSpeed(20);
        ['A', 'B', 'C'].forEach(addNode);
        addEdge('A', 'B');
        addEdge('B', 'C');

        const pending = bfsTraversal('A');
        await sleep(5);
        clearGraph();
        await pending;

        expect(graphNodes).toEqual({}); // clearGraph's own reset, not overwritten by the stale traversal

        setSpeed(0);
        addNode('X');
        await bfsTraversal('X'); // must not be blocked by a stuck graphBusy lock
        expect(statusText()).toBe('BFS order: X');
    });
});
