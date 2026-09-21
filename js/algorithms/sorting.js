
// ==========================================
// SORTING ALGORITHMS ENGINE (js/algorithms/sorting.js)
// ==========================================
// Each function below is a GENERATOR (function*). It doesn't touch the DOM
// or sleep() at all — it just yields a snapshot object after every
// meaningful step. A StepPlayer (see visualizer.js) pulls from it, whether
// that's for autoplay or manual Next/Prev stepping.
//
// Step shape: { array, highlights, message, statusClass }

function* bubbleSortSteps(inputArr) {
    const arr = [...inputArr];
    const n = arr.length;
    const sortedIdx = [];

    yield { array: [...arr], highlights: {}, message: 'Starting Bubble Sort...', statusClass: 'searching', phase: 'start' };

    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - i - 1; j++) {
            yield {
                array: [...arr],
                highlights: { comparing: [j, j + 1], sorted: [...sortedIdx] },
                message: `Comparing ${arr[j]} and ${arr[j + 1]}...`,
                statusClass: 'searching',
                phase: 'compare'
            };

            if (arr[j] > arr[j + 1]) {
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                yield {
                    array: [...arr],
                    highlights: { comparing: [j, j + 1], sorted: [...sortedIdx] },
                    message: `Swapped ${arr[j + 1]} and ${arr[j]}`,
                    statusClass: 'searching',
                    phase: 'swap'
                };
            }
        }
        sortedIdx.push(n - i - 1);
    }
    sortedIdx.push(0);

    yield { array: [...arr], highlights: { sorted: [...sortedIdx] }, message: 'Array sorted!', statusClass: 'success', phase: 'done' };
}

function* selectionSortSteps(inputArr) {
    const arr = [...inputArr];
    const n = arr.length;
    const sortedIdx = [];

    yield { array: [...arr], highlights: {}, message: 'Starting Selection Sort...', statusClass: 'searching', phase: 'start' };

    for (let i = 0; i < n - 1; i++) {
        let minIdx = i;
        yield { array: [...arr], highlights: { current: [minIdx], sorted: [...sortedIdx] }, message: `Assuming ${arr[i]} is the minimum...`, statusClass: 'searching', phase: 'assume-min' };

        for (let j = i + 1; j < n; j++) {
            yield {
                array: [...arr],
                highlights: { current: [minIdx], comparing: [j], sorted: [...sortedIdx] },
                message: `Comparing ${arr[j]} with current minimum ${arr[minIdx]}...`,
                statusClass: 'searching',
                phase: 'compare'
            };

            if (arr[j] < arr[minIdx]) {
                minIdx = j;
                yield {
                    array: [...arr],
                    highlights: { current: [minIdx], sorted: [...sortedIdx] },
                    message: `New minimum found: ${arr[minIdx]}`,
                    statusClass: 'searching',
                    phase: 'new-min'
                };
            }
        }

        if (minIdx !== i) {
            [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
            yield {
                array: [...arr],
                highlights: { current: [i], sorted: [...sortedIdx] },
                message: `Swapped ${arr[i]} into position ${i}`,
                statusClass: 'searching',
                phase: 'swap'
            };
        }

        sortedIdx.push(i);
    }
    sortedIdx.push(n - 1);

    yield { array: [...arr], highlights: { sorted: [...sortedIdx] }, message: 'Array sorted!', statusClass: 'success', phase: 'done' };
}

function* insertionSortSteps(inputArr) {
    const arr = [...inputArr];
    const n = arr.length;

    yield { array: [...arr], highlights: { sorted: [0] }, message: 'Starting Insertion Sort...', statusClass: 'searching', phase: 'start' };

    for (let i = 1; i < n; i++) {
        let key = arr[i];
        let j = i - 1;
        const sortedSoFar = () => Array.from({ length: i }, (_, k) => k);

        yield {
            array: [...arr],
            highlights: { current: [i], sorted: sortedSoFar() },
            message: `Picking up ${key} to insert into the sorted portion...`,
            statusClass: 'searching',
            phase: 'pick-key'
        };

        while (j >= 0 && arr[j] > key) {
            yield {
                array: [...arr],
                highlights: { comparing: [j], current: [i], sorted: sortedSoFar() },
                message: `${arr[j]} > ${key}, shifting it right...`,
                statusClass: 'searching',
                phase: 'compare-shift'
            };

            arr[j + 1] = arr[j];
            j--;

            yield {
                array: [...arr],
                highlights: { sorted: sortedSoFar() },
                message: `Shifted. Continuing to compare...`,
                statusClass: 'searching',
                phase: 'shift'
            };
        }

        arr[j + 1] = key;

        yield {
            array: [...arr],
            highlights: { sorted: Array.from({ length: i + 1 }, (_, k) => k) },
            message: `Inserted ${key} at position ${j + 1}`,
            statusClass: 'searching',
            phase: 'insert'
        };
    }

    yield { array: [...arr], highlights: { sorted: Array.from({ length: n }, (_, k) => k) }, message: 'Array sorted!', statusClass: 'success', phase: 'done' };
}

function* mergeSortSteps(inputArr) {
    const arr = [...inputArr];
    const n = arr.length;

    yield { array: [...arr], highlights: {}, message: 'Starting Merge Sort...', statusClass: 'searching', phase: 'start' };

    function rangeIndices(left, right) {
        const out = [];
        for (let x = left; x <= right; x++) out.push(x);
        return out;
    }
    function outsideRange(left, right) {
        const out = [];
        for (let x = 0; x < n; x++) if (x < left || x > right) out.push(x);
        return out;
    }

    function* mergeRanges(left, mid, right) {
        const leftCopy = arr.slice(left, mid + 1);
        const rightCopy = arr.slice(mid + 1, right + 1);
        let i = 0, j = 0, k = left;

        while (i < leftCopy.length && j < rightCopy.length) {
            yield {
                array: [...arr],
                highlights: { comparing: [left + i, mid + 1 + j], dimmed: outsideRange(left, right) },
                message: `Comparing ${leftCopy[i]} and ${rightCopy[j]}...`,
                statusClass: 'searching',
                phase: 'merge-compare'
            };

            if (leftCopy[i] <= rightCopy[j]) {
                arr[k] = leftCopy[i];
                i++;
            } else {
                arr[k] = rightCopy[j];
                j++;
            }

            yield {
                array: [...arr],
                highlights: { current: [k], dimmed: outsideRange(left, right) },
                message: `Placed ${arr[k]} at index [${k}]`,
                statusClass: 'searching',
                phase: 'merge-overwrite'
            };
            k++;
        }
        while (i < leftCopy.length) {
            arr[k] = leftCopy[i];
            yield { array: [...arr], highlights: { current: [k], dimmed: outsideRange(left, right) }, message: `Placed ${arr[k]} at index [${k}]`, statusClass: 'searching', phase: 'merge-overwrite' };
            i++; k++;
        }
        while (j < rightCopy.length) {
            arr[k] = rightCopy[j];
            yield { array: [...arr], highlights: { current: [k], dimmed: outsideRange(left, right) }, message: `Placed ${arr[k]} at index [${k}]`, statusClass: 'searching', phase: 'merge-overwrite' };
            j++; k++;
        }
    }

    function* mergeSortRange(left, right) {
        if (right - left <= 0) return;
        const mid = Math.floor((left + right) / 2);

        yield {
            array: [...arr],
            highlights: { current: rangeIndices(left, right), dimmed: outsideRange(left, right) },
            message: `Splitting range [${left}..${right}] at midpoint ${mid}`,
            statusClass: 'searching',
            phase: 'split'
        };

        yield* mergeSortRange(left, mid);
        yield* mergeSortRange(mid + 1, right);
        yield* mergeRanges(left, mid, right);
    }

    yield* mergeSortRange(0, n - 1);

    yield { array: [...arr], highlights: { sorted: Array.from({ length: n }, (_, k) => k) }, message: 'Array sorted!', statusClass: 'success', phase: 'done' };
}

function* quickSortSteps(inputArr) {
    const arr = [...inputArr];
    const n = arr.length;
    const sortedIdx = [];

    yield { array: [...arr], highlights: {}, message: 'Starting Quick Sort...', statusClass: 'searching', phase: 'start' };

    function* quickSortRange(low, high) {
        if (low > high) return;
        if (low === high) {
            sortedIdx.push(low);
            return;
        }

        const pivotValue = arr[high];
        yield {
            array: [...arr],
            highlights: { current: [high], sorted: [...sortedIdx] },
            message: `Choosing pivot: ${pivotValue} (last element of range)`,
            statusClass: 'searching',
            phase: 'pivot'
        };

        let i = low - 1;
        for (let j = low; j < high; j++) {
            yield {
                array: [...arr],
                highlights: { comparing: [j], current: [high], sorted: [...sortedIdx] },
                message: `Comparing ${arr[j]} with pivot ${pivotValue}...`,
                statusClass: 'searching',
                phase: 'compare'
            };

            if (arr[j] < pivotValue) {
                i++;
                if (i !== j) {
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                    yield {
                        array: [...arr],
                        highlights: { comparing: [i, j], current: [high], sorted: [...sortedIdx] },
                        message: `Swapped ${arr[j]} and ${arr[i]}`,
                        statusClass: 'searching',
                        phase: 'swap'
                    };
                }
            }
        }

        [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
        const pivotIndex = i + 1;
        sortedIdx.push(pivotIndex);

        yield {
            array: [...arr],
            highlights: { sorted: [...sortedIdx] },
            message: `Pivot ${arr[pivotIndex]} placed at its sorted position [${pivotIndex}]`,
            statusClass: 'searching',
            phase: 'partition-done'
        };

        yield* quickSortRange(low, pivotIndex - 1);
        yield* quickSortRange(pivotIndex + 1, high);
    }

    yield* quickSortRange(0, n - 1);

    yield { array: [...arr], highlights: { sorted: Array.from({ length: n }, (_, k) => k) }, message: 'Array sorted!', statusClass: 'success', phase: 'done' };
}
