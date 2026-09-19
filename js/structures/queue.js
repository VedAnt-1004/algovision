
// ==========================================
// QUEUE ENGINE (js/structures/queue.js)
// ==========================================
// Same pattern as stack.js — a live, persistent structure. No generator/
// StepPlayer; each function mutates queueState directly and re-renders.

let queueState = [];
let queueBusy = false; // guards against overlapping Enqueue/Dequeue and against Clear racing a pending animation

function setQueueControlsDisabled(disabled) {
    ['enqueue-btn', 'dequeue-btn', 'peek-btn', 'clear-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = disabled;
    });
}

function renderQueue() {
    const container = document.getElementById('visualizer-container');
    if (!container) return;

    container.classList.remove('stack-mode');
    container.classList.add('queue-mode');
    container.innerHTML = '';

    if (queueState.length === 0) {
        const empty = document.createElement('div');
        empty.classList.add('empty-structure-msg');
        empty.innerText = 'Queue is empty — enqueue a value to begin';
        container.appendChild(empty);
        return;
    }

    queueState.forEach((value, idx) => {
        const isFront = idx === 0;
        const isRear = idx === queueState.length - 1;

        const wrapper = document.createElement('div');
        wrapper.classList.add('queue-block-wrapper');

        // Label sits above the block; blank for interior elements
        const topLabel = document.createElement('span');
        if (isFront && isRear) {
            topLabel.classList.add('queue-label-front', 'queue-label-rear');
            topLabel.innerText = 'FRONT / REAR';
        } else if (isFront) {
            topLabel.classList.add('queue-label-front');
            topLabel.innerText = 'FRONT';
        } else if (isRear) {
            topLabel.classList.add('queue-label-rear');
            topLabel.innerText = 'REAR';
        } else {
            topLabel.classList.add('queue-label-spacer');
            topLabel.innerHTML = '&nbsp;';
        }
        wrapper.appendChild(topLabel);

        const block = document.createElement('div');
        block.classList.add('array-block');
        block.innerText = value;
        if (isFront) block.classList.add('current');
        wrapper.appendChild(block);

        container.appendChild(wrapper);
    });
}

async function enqueue(value) {
    if (queueBusy) return;
    queueBusy = true;
    setQueueControlsDisabled(true);

    try {
        queueState.push(value);
        renderQueue();

        const statusBar = document.getElementById('status-bar');
        statusBar.className = 'status-message success';
        statusBar.innerText = `Enqueued ${value} at the rear`;
    } finally {
        queueBusy = false;
        setQueueControlsDisabled(false);
    }
}

async function dequeue() {
    if (queueBusy) return null;
    queueBusy = true;
    setQueueControlsDisabled(true);
    const statusBar = document.getElementById('status-bar');

    try {
        if (queueState.length === 0) {
            statusBar.className = 'status-message error';
            statusBar.innerText = 'Queue is empty — nothing to dequeue';
            return null;
        }

        const myGeneration = workspaceGeneration;
        const container = document.getElementById('visualizer-container');
        const frontWrapper = container.firstElementChild;
        const frontBlock = frontWrapper ? frontWrapper.querySelector('.array-block') : null;
        if (frontBlock) frontBlock.classList.add('dequeuing');

        await sleep(300); // matches the .array-block CSS transition duration
        if (myGeneration !== workspaceGeneration) return null; // navigated away or cleared mid-animation

        const dequeued = queueState.shift();
        renderQueue();

        statusBar.className = 'status-message success';
        statusBar.innerText = `Dequeued ${dequeued} from the front`;
        return dequeued;
    } finally {
        queueBusy = false;
        setQueueControlsDisabled(false);
    }
}

function peekQueue() {
    const statusBar = document.getElementById('status-bar');

    if (queueState.length === 0) {
        statusBar.className = 'status-message error';
        statusBar.innerText = 'Queue is empty — nothing to peek';
        return null;
    }

    renderQueue();
    statusBar.className = 'status-message searching';
    statusBar.innerText = `Front of queue: ${queueState[0]}`;
    return queueState[0];
}

function clearQueue() {
    workspaceGeneration++; // orphan any pending dequeue animation so it can't resurrect after this clear
    queueState = [];
    queueBusy = false;
    setQueueControlsDisabled(false);
    renderQueue();
    const statusBar = document.getElementById('status-bar');
    if (statusBar) statusBar.className = 'status-message hidden';
}
