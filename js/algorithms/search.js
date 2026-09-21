
// ==========================================
// SEARCH ALGORITHMS ENGINE (js/algorithms/search.js)
// ==========================================
// Generators, same contract as sorting.js — see that file's header comment.

function* linearSearchSteps(inputArr, target) {
    const arr = [...inputArr];

    yield { array: [...arr], highlights: {}, message: `Searching for ${target}...`, statusClass: 'searching', phase: 'start' };

    for (let i = 0; i < arr.length; i++) {
        yield { array: [...arr], highlights: { current: [i] }, message: `Checking index [${i}]: is ${arr[i]} equal to ${target}?`, statusClass: 'searching', phase: 'checking' };

        if (arr[i] === target) {
            yield { array: [...arr], highlights: { found: i }, message: `Element ${target} found at index [${i}]!`, statusClass: 'success', phase: 'found' };
            return;
        }
    }

    yield { array: [...arr], highlights: {}, message: `Element ${target} not found in the array.`, statusClass: 'error', phase: 'not-found' };
}

function* binarySearchSteps(inputArr, target) {
    const arr = [...inputArr];

    yield { array: [...arr], highlights: {}, message: `Starting Binary Search for ${target}...`, statusClass: 'searching', phase: 'start' };

    let left = 0;
    let right = arr.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const dimmed = [];
        for (let i = 0; i < arr.length; i++) {
            if (i < left || i > right) dimmed.push(i);
        }

        yield {
            array: [...arr],
            highlights: { current: [mid], dimmed },
            message: `Checking middle element at index [${mid}]: is ${arr[mid]} equal to ${target}?`,
            statusClass: 'searching',
            phase: 'checking'
        };

        if (arr[mid] === target) {
            yield { array: [...arr], highlights: { found: mid, dimmed }, message: `Element ${target} found at index [${mid}]!`, statusClass: 'success', phase: 'found' };
            return;
        }

        if (arr[mid] < target) {
            left = mid + 1;
            yield {
                array: [...arr],
                highlights: { dimmed: dimmed.concat(mid) },
                message: `${arr[mid]} is too small. Discarding left half.`,
                statusClass: 'searching',
                phase: 'discard-left'
            };
        } else {
            right = mid - 1;
            yield {
                array: [...arr],
                highlights: { dimmed: dimmed.concat(mid) },
                message: `${arr[mid]} is too big. Discarding right half.`,
                statusClass: 'searching',
                phase: 'discard-right'
            };
        }
    }

    yield { array: [...arr], highlights: {}, message: `Element ${target} not found.`, statusClass: 'error', phase: 'not-found' };
}
