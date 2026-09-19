
// ==========================================
// STACK ENGINE (js/structures/stack.js)
// ==========================================
// Unlike search/sorting, this is a LIVE, persistent structure — operations
// happen one at a time over an open-ended session, not as a single
// step-through run. So there's no generator/StepPlayer here; each function
// mutates stackState directly and re-renders immediately.

let stackState = [];
let stackBusy = false; // guards against overlapping Push/Pop and against Clear racing a pending animation

function setStackControlsDisabled(disabled) {
    ['push-btn', 'pop-btn', 'peek-btn', 'clear-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = disabled;
    });
}

function renderStack() {
    const container = document.getElementById('visualizer-container');
    if (!container) return;

    container.classList.remove('queue-mode');
    container.classList.add('stack-mode');
    container.innerHTML = '';

    if (stackState.length === 0) {
        const empty = document.createElement('div');
        empty.classList.add('empty-structure-msg');
        empty.innerText = 'Stack is empty — push a value to begin';
        container.appendChild(empty);
        return;
    }

    stackState.forEach((value, idx) => {
        const isTop = idx === stackState.length - 1;

        const wrapper = document.createElement('div');
        wrapper.classList.add('stack-block-wrapper');

        const block = document.createElement('div');
        block.classList.add('array-block');
        block.innerText = value;
        if (isTop) block.classList.add('current');
        wrapper.appendChild(block);

        if (isTop) {
            const label = document.createElement('span');
            label.classList.add('stack-side-label');
            label.innerText = '← TOP';
            wrapper.appendChild(label);
        }

        container.appendChild(wrapper);
    });
}

async function pushToStack(value) {
    if (stackBusy) return;
    stackBusy = true;
    setStackControlsDisabled(true);

    try {
        stackState.push(value);
        renderStack();

        const statusBar = document.getElementById('status-bar');
        statusBar.className = 'status-message success';
        statusBar.innerText = `Pushed ${value} onto the stack`;
    } finally {
        stackBusy = false;
        setStackControlsDisabled(false);
    }
}

async function popFromStack() {
    if (stackBusy) return null;
    stackBusy = true;
    setStackControlsDisabled(true);
    const statusBar = document.getElementById('status-bar');

    try {
        if (stackState.length === 0) {
            statusBar.className = 'status-message error';
            statusBar.innerText = 'Stack is empty — nothing to pop';
            return null;
        }

        const myGeneration = workspaceGeneration;
        const container = document.getElementById('visualizer-container');
        const topWrapper = container.lastElementChild;
        const topBlock = topWrapper ? topWrapper.querySelector('.array-block') : null;
        if (topBlock) topBlock.classList.add('popping');

        await sleep(300); // matches the .array-block CSS transition duration
        if (myGeneration !== workspaceGeneration) return null; // navigated away or cleared mid-animation

        const popped = stackState.pop();
        renderStack();

        statusBar.className = 'status-message success';
        statusBar.innerText = `Popped ${popped} from the stack`;
        return popped;
    } finally {
        stackBusy = false;
        setStackControlsDisabled(false);
    }
}

function peekStack() {
    const statusBar = document.getElementById('status-bar');

    if (stackState.length === 0) {
        statusBar.className = 'status-message error';
        statusBar.innerText = 'Stack is empty — nothing to peek';
        return null;
    }

    renderStack();
    statusBar.className = 'status-message searching';
    statusBar.innerText = `Top of stack: ${stackState[stackState.length - 1]}`;
    return stackState[stackState.length - 1];
}

function clearStack() {
    workspaceGeneration++; // orphan any pending pop animation so it can't resurrect after this clear
    stackState = [];
    stackBusy = false;
    setStackControlsDisabled(false);
    renderStack();
    const statusBar = document.getElementById('status-bar');
    if (statusBar) statusBar.className = 'status-message hidden';
}
