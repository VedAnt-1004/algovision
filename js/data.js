
// ==========================================
// ALGORITHM ENCYCLOPEDIA (js/data.js)
// ==========================================

const algorithmDatabase = {

    /* ==========================================
       1. SEARCHING ALGORITHMS
       ========================================== */

    // --- 1.1 Sequential Searches --- //

    "linear-search": {
        title: "Linear Search",
        category: "array",
        type: "search",
        description: "Imagine you have a list of numbers: [5, 3, 8, 1, 9] and you want to find the number 8.\n\n1. Start from the first number (5). Is 5 equal to 8? No.\n\n2. Move to the next number (3). Is 3 equal to 8? No.\n\n3. Move to the next number (8). Is 8 equal to 8? Yes! Stop here.\n\n4. The position is 2 (or 3 if counting starts from 1).\n\nIf the number is not in the list (e.g., searching for 10), the search ends without success.",
        lineMap: { javascript: { start: 2, checking: 3, found: 4, 'not-found': 7 }, python: { start: 2, checking: 3, found: 4, 'not-found': 5 }, cpp: { start: 2, checking: 3, found: 4, 'not-found': 7 } },
        complexities: { worst: "O(n)", space: "O(1)" },
        code: {
            javascript: `function linearSearch(arr, target) {
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === target) {
            return i; // Target found
        }
    }
    return -1; // Target not found
}`,
            python: `def linear_search(arr, target):
    for i in range(len(arr)):
        if arr[i] == target:
            return i # Target found
    return -1 # Target not found`,
            cpp: `int linearSearch(int arr[], int size, int target) {
    for (int i = 0; i < size; i++) {
        if (arr[i] == target) {
            return i; // Target found
        }
    }
    return -1; // Target not found
}`
        }
    },

    // --- 1.2 Divide & Conquer Searches --- //

    "binary-search": {
        title: "Binary Search",
        category: "array",
        type: "search",
        description: "Binary Search is a highly efficient algorithm that works by repeatedly dividing the search space in half. It compares the target value to the middle element of the array. NOTE: The array must be strictly sorted for this to work!",
        lineMap: { javascript: { start: 2, checking: 6, found: 8, 'discard-left': 9, 'discard-right': 10, 'not-found': 12 }, python: { start: 2, checking: 5, found: 6, 'discard-left': 9, 'discard-right': 11, 'not-found': 13 }, cpp: { start: 2, checking: 6, found: 8, 'discard-left': 9, 'discard-right': 10, 'not-found': 12 } },
        complexities: { worst: "O(log n)", space: "O(1)" },
        code: {
            javascript: `function binarySearch(arr, target) {
    let left = 0;
    let right = arr.length - 1;
    
    while (left <= right) {
        let mid = Math.floor((left + right) / 2);
        
        if (arr[mid] === target) return mid;
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}`,
            python: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
            
    return -1`,
            cpp: `int binarySearch(int arr[], int size, int target) {
    int left = 0;
    int right = size - 1;
    
    while (left <= right) {
        int mid = left + (right - left) / 2;
        
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}`
        }
    },

    /* ==========================================
       2. SORTING ALGORITHMS
       ========================================== */

    // --- 2.1 O(n^2) Simple Sorts --- //

    "bubble-sort": {
        title: "Bubble Sort",
        category: "array",
        type: "sorting",
        description: "Bubble Sort repeatedly steps through the array, compares each pair of adjacent elements, and swaps them if they're in the wrong order.\n\n1. Compare the first two elements. If the left one is bigger, swap them.\n\n2. Move to the next pair and repeat.\n\n3. After one full pass, the largest element has 'bubbled up' to the end.\n\n4. Repeat the whole pass, ignoring the already-sorted tail, until no swaps are needed.\n\nIt's simple to understand but inefficient on large lists.",
        lineMap: { javascript: { start: 2, compare: 5, swap: 6, done: 10 }, python: { start: 2, compare: 5, swap: 6, done: 7 }, cpp: { start: 2, compare: 4, swap: 5, done: 9 } },
        complexities: { worst: "O(n²)", space: "O(1)" },
        code: {
            javascript: `function bubbleSort(arr) {
    let n = arr.length;
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
            }
        }
    }
    return arr;
}`,
            python: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr`,
            cpp: `void bubbleSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                swap(arr[j], arr[j + 1]);
            }
        }
    }
}`
        }
    },

    "selection-sort": {
        title: "Selection Sort",
        category: "array",
        type: "sorting",
        description: "Selection Sort divides the array into a sorted part and an unsorted part.\n\n1. Find the smallest element in the unsorted part.\n\n2. Swap it with the first element of the unsorted part.\n\n3. Move the boundary between sorted and unsorted forward by one.\n\n4. Repeat until the whole array is sorted.\n\nIt always does the same number of comparisons regardless of input order.",
        lineMap: { javascript: { start: 2, 'assume-min': 4, compare: 6, 'new-min': 7, swap: 11, done: 14 }, python: { start: 2, 'assume-min': 4, compare: 6, 'new-min': 7, swap: 8, done: 9 }, cpp: { start: 2, 'assume-min': 3, compare: 5, 'new-min': 6, swap: 9, done: 11 } },
        complexities: { worst: "O(n²)", space: "O(1)" },
        code: {
            javascript: `function selectionSort(arr) {
    let n = arr.length;
    for (let i = 0; i < n - 1; i++) {
        let minIdx = i;
        for (let j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        if (minIdx !== i) {
            [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
        }
    }
    return arr;
}`,
            python: `def selection_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        min_idx = i
        for j in range(i + 1, n):
            if arr[j] < arr[min_idx]:
                min_idx = j
        arr[i], arr[min_idx] = arr[min_idx], arr[i]
    return arr`,
            cpp: `void selectionSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        swap(arr[i], arr[minIdx]);
    }
}`
        }
    },

    "insertion-sort": {
        title: "Insertion Sort",
        category: "array",
        type: "sorting",
        description: "Insertion Sort builds the sorted array one element at a time, like sorting playing cards in your hand.\n\n1. Start with the second element as the 'key'.\n\n2. Compare it to elements before it, shifting larger ones to the right.\n\n3. Insert the key into its correct position in the sorted portion.\n\n4. Move to the next element and repeat.\n\nIt's efficient for small or nearly-sorted arrays.",
        lineMap: { javascript: { start: 2, 'pick-key': 3, 'compare-shift': 5, shift: 6, insert: 9, done: 11 }, python: { start: 2, 'pick-key': 3, 'compare-shift': 5, shift: 6, insert: 8, done: 9 }, cpp: { start: 2, 'pick-key': 3, 'compare-shift': 5, shift: 6, insert: 9, done: 11 } },
        complexities: { worst: "O(n²)", space: "O(1)" },
        code: {
            javascript: `function insertionSort(arr) {
    for (let i = 1; i < arr.length; i++) {
        let key = arr[i];
        let j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
    return arr;
}`,
            python: `def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key
    return arr`,
            cpp: `void insertionSort(int arr[], int n) {
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
}`
        }
    },

    // --- 2.2 O(n log n) Fast Sorts --- //

    "merge-sort": {
        title: "Merge Sort",
        category: "array",
        type: "sorting",
        lineMap: { javascript: { start: 2, split: 4, 'merge-compare': 16, 'merge-overwrite': 17, done: 8 }, python: { start: 2, split: 5, 'merge-compare': 17, 'merge-overwrite': 18, done: 9 }, cpp: { start: 21, split: 23, 'merge-compare': 6, 'merge-overwrite': 7, done: 30 } },
        description: "Merge Sort splits the array in half recursively until each piece has one element, then merges those pieces back together in sorted order.\n\n1. Split the array at the midpoint into two halves.\n\n2. Recursively sort each half the same way.\n\n3. Merge the two sorted halves: repeatedly compare their front elements and take the smaller one.\n\n4. Once merged, the range is fully sorted.\n\nUnlike Bubble/Selection/Insertion Sort, its performance doesn't degrade on already-sorted or reverse-sorted input.",
        complexities: { worst: "O(n log n)", space: "O(n)" },
        code: {
            javascript: `function mergeSort(arr) {
    if (arr.length <= 1) return arr;

    const mid = Math.floor(arr.length / 2);
    const left = mergeSort(arr.slice(0, mid));
    const right = mergeSort(arr.slice(mid));

    return merge(left, right);
}

function merge(left, right) {
    let result = [];
    let i = 0, j = 0;

    while (i < left.length && j < right.length) {
        if (left[i] <= right[j]) {
            result.push(left[i]);
            i++;
        } else {
            result.push(right[j]);
            j++;
        }
    }

    return result.concat(left.slice(i)).concat(right.slice(j));
}`,
            python: `def merge_sort(arr):
    if len(arr) <= 1:
        return arr

    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])

    return merge(left, right)


def merge(left, right):
    result = []
    i = j = 0

    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1

    return result + left[i:] + right[j:]`,
            cpp: `vector<int> merge(vector<int>& left, vector<int>& right) {
    vector<int> result;
    int i = 0, j = 0;

    while (i < left.size() && j < right.size()) {
        if (left[i] <= right[j]) {
            result.push_back(left[i]);
            i++;
        } else {
            result.push_back(right[j]);
            j++;
        }
    }

    while (i < left.size()) result.push_back(left[i++]);
    while (j < right.size()) result.push_back(right[j++]);
    return result;
}

vector<int> mergeSort(vector<int> arr) {
    if (arr.size() <= 1) return arr;

    int mid = arr.size() / 2;
    vector<int> left(arr.begin(), arr.begin() + mid);
    vector<int> right(arr.begin() + mid, arr.end());

    left = mergeSort(left);
    right = mergeSort(right);

    return merge(left, right);
}`
        }
    },

    "quick-sort": {
        title: "Quick Sort",
        category: "array",
        type: "sorting",
        lineMap: { javascript: { start: 2, pivot: 11, compare: 15, swap: 17, 'partition-done': 21, done: 7 }, python: { start: 5, pivot: 14, compare: 18, swap: 20, 'partition-done': 22, done: 10 }, cpp: { start: 17, pivot: 2, compare: 6, swap: 8, 'partition-done': 12, done: 22 } },
        description: "Quick Sort picks a pivot element and partitions the array so smaller elements end up on its left and larger ones on its right, then recursively sorts each side.\n\n1. Choose a pivot (here, the last element of the range).\n\n2. Walk through the range, moving anything smaller than the pivot to the left side.\n\n3. Swap the pivot into the boundary between smaller and larger — it's now in its final sorted position.\n\n4. Recursively repeat on the left and right partitions.\n\nVery fast in practice (often faster than Merge Sort due to better cache behavior), but worst-case O(n²) on already-sorted input with this pivot strategy.",
        complexities: { worst: "O(n²)", space: "O(log n)" },
        code: {
            javascript: `function quickSort(arr, low = 0, high = arr.length - 1) {
    if (low < high) {
        const pivotIndex = partition(arr, low, high);
        quickSort(arr, low, pivotIndex - 1);
        quickSort(arr, pivotIndex + 1, high);
    }
    return arr;
}

function partition(arr, low, high) {
    const pivot = arr[high];
    let i = low - 1;

    for (let j = low; j < high; j++) {
        if (arr[j] < pivot) {
            i++;
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
    return i + 1;
}`,
            python: `def quick_sort(arr, low=0, high=None):
    if high is None:
        high = len(arr) - 1

    if low < high:
        pivot_index = partition(arr, low, high)
        quick_sort(arr, low, pivot_index - 1)
        quick_sort(arr, pivot_index + 1, high)

    return arr


def partition(arr, low, high):
    pivot = arr[high]
    i = low - 1

    for j in range(low, high):
        if arr[j] < pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]

    arr[i + 1], arr[high] = arr[high], arr[i + 1]
    return i + 1`,
            cpp: `int partition(vector<int>& arr, int low, int high) {
    int pivot = arr[high];
    int i = low - 1;

    for (int j = low; j < high; j++) {
        if (arr[j] < pivot) {
            i++;
            swap(arr[i], arr[j]);
        }
    }

    swap(arr[i + 1], arr[high]);
    return i + 1;
}

void quickSort(vector<int>& arr, int low, int high) {
    if (low < high) {
        int pivotIndex = partition(arr, low, high);
        quickSort(arr, low, pivotIndex - 1);
        quickSort(arr, pivotIndex + 1, high);
    }
}`
        }
    },

    /* ==========================================
       3. STACK
       ========================================== */

    "stack-operations": {
        title: "Stack (LIFO)",
        category: "stack",
        type: "stack",
        description: "A Stack follows Last-In, First-Out (LIFO) order — think of a stack of plates. You can only add or remove from the top.\n\nPush: place a new element on top.\n\nPop: remove and return the top element.\n\nPeek: look at the top element without removing it.\n\nStacks power undo/redo history, browser back buttons, and function call management (the call stack).",
        complexities: { worst: "O(1)", space: "O(n)" },
        code: {
            javascript: `class Stack {
    constructor() {
        this.items = [];
    }

    push(value) {
        this.items.push(value);
    }

    pop() {
        if (this.isEmpty()) return null;
        return this.items.pop();
    }

    peek() {
        if (this.isEmpty()) return null;
        return this.items[this.items.length - 1];
    }

    isEmpty() {
        return this.items.length === 0;
    }
}`,
            python: `class Stack:
    def __init__(self):
        self.items = []

    def push(self, value):
        self.items.append(value)

    def pop(self):
        if self.is_empty():
            return None
        return self.items.pop()

    def peek(self):
        if self.is_empty():
            return None
        return self.items[-1]

    def is_empty(self):
        return len(self.items) == 0`,
            cpp: `class Stack {
    vector<int> items;
public:
    void push(int value) {
        items.push_back(value);
    }

    int pop() {
        if (isEmpty()) return -1;
        int top = items.back();
        items.pop_back();
        return top;
    }

    int peek() {
        if (isEmpty()) return -1;
        return items.back();
    }

    bool isEmpty() {
        return items.empty();
    }
};`
        }
    },

    /* ==========================================
       4. QUEUE
       ========================================== */

    "queue-operations": {
        title: "Queue (FIFO)",
        category: "queue",
        type: "queue",
        description: "A Queue follows First-In, First-Out (FIFO) order — like a checkout line. Elements join at the rear and leave from the front.\n\nEnqueue: add a new element at the rear.\n\nDequeue: remove and return the front element.\n\nPeek: look at the front element without removing it.\n\nQueues power task scheduling, print queues, and breadth-first search traversal.",
        complexities: { worst: "O(1)", space: "O(n)" },
        code: {
            javascript: `class Queue {
    constructor() {
        this.items = [];
    }

    enqueue(value) {
        this.items.push(value);
    }

    dequeue() {
        if (this.isEmpty()) return null;
        return this.items.shift();
    }

    peek() {
        if (this.isEmpty()) return null;
        return this.items[0];
    }

    isEmpty() {
        return this.items.length === 0;
    }
}`,
            python: `class Queue:
    def __init__(self):
        self.items = []

    def enqueue(self, value):
        self.items.append(value)

    def dequeue(self):
        if self.is_empty():
            return None
        return self.items.pop(0)

    def peek(self):
        if self.is_empty():
            return None
        return self.items[0]

    def is_empty(self):
        return len(self.items) == 0`,
            cpp: `class Queue {
    deque<int> items;
public:
    void enqueue(int value) {
        items.push_back(value);
    }

    int dequeue() {
        if (isEmpty()) return -1;
        int front = items.front();
        items.pop_front();
        return front;
    }

    int peek() {
        if (isEmpty()) return -1;
        return items.front();
    }

    bool isEmpty() {
        return items.empty();
    }
};`
        }
    },

    /* ==========================================
       5. TREE
       ========================================== */

    "bst-operations": {
        title: "Binary Search Tree",
        category: "tree",
        type: "tree",
        description: "A Binary Search Tree (BST) keeps every node ordered: for any node, everything in its left subtree is smaller, everything in its right subtree is larger.\n\nInsert: compare against the current node, go left if smaller, right if larger, and repeat until an empty spot is found.\n\nSearch: same left/right comparison — you either find the value or fall off the tree.\n\nThis ordering means search, insert, and delete all take O(log n) time on average — but a poorly built tree (e.g. inserting already-sorted data) can degrade to a straight line, making it O(n).",
        complexities: { worst: "O(n)", space: "O(n)" },
        code: {
            javascript: `class Node {
    constructor(value) {
        this.value = value;
        this.left = null;
        this.right = null;
    }
}

class BST {
    constructor() {
        this.root = null;
    }

    insert(value) {
        const newNode = new Node(value);
        if (!this.root) {
            this.root = newNode;
            return;
        }
        let current = this.root;
        while (true) {
            if (value === current.value) return;
            if (value < current.value) {
                if (!current.left) { current.left = newNode; return; }
                current = current.left;
            } else {
                if (!current.right) { current.right = newNode; return; }
                current = current.right;
            }
        }
    }

    search(value) {
        let current = this.root;
        while (current) {
            if (value === current.value) return current;
            current = value < current.value ? current.left : current.right;
        }
        return null;
    }
}`,
            python: `class Node:
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None


class BST:
    def __init__(self):
        self.root = None

    def insert(self, value):
        new_node = Node(value)
        if not self.root:
            self.root = new_node
            return
        current = self.root
        while True:
            if value == current.value:
                return
            if value < current.value:
                if not current.left:
                    current.left = new_node
                    return
                current = current.left
            else:
                if not current.right:
                    current.right = new_node
                    return
                current = current.right

    def search(self, value):
        current = self.root
        while current:
            if value == current.value:
                return current
            current = current.left if value < current.value else current.right
        return None`,
            cpp: `struct Node {
    int value;
    Node* left;
    Node* right;
    Node(int v) : value(v), left(nullptr), right(nullptr) {}
};

class BST {
    Node* root = nullptr;
public:
    void insert(int value) {
        Node* newNode = new Node(value);
        if (!root) { root = newNode; return; }
        Node* current = root;
        while (true) {
            if (value == current->value) return;
            if (value < current->value) {
                if (!current->left) { current->left = newNode; return; }
                current = current->left;
            } else {
                if (!current->right) { current->right = newNode; return; }
                current = current->right;
            }
        }
    }

    Node* search(int value) {
        Node* current = root;
        while (current) {
            if (value == current->value) return current;
            current = (value < current->value) ? current->left : current->right;
        }
        return nullptr;
    }
};`
        }
    },

    // --- 5.1 Self-Balancing Trees (generator-driven; AVL insertion) --- //
    // lineMap keys are the phases yielded by avlInsertSteps in js/structures/tree.js.

    "avl-tree": {
        title: "AVL Tree",
        category: "tree",
        type: "avl",
        description: "An AVL tree is a self-balancing Binary Search Tree. After every insertion it checks each ancestor of the new node and, if the tree has become lopsided, repairs it with a rotation — so the height always stays O(log n), even for sorted input that would flatten a plain BST into a list.\n\n1. Insert the value exactly like a normal BST.\n\n2. Walk back up the path and recompute each node's height: 1 + max(left height, right height).\n\n3. Compute its balance factor: left height − right height. If it is −1, 0 or +1, the node is fine.\n\n4. If it is +2 or −2, rotate: Left-Left → rotate right; Right-Right → rotate left; Left-Right → rotate the child left, then the node right; Right-Left → rotate the child right, then the node left.\n\nOn screen: each node shows h (height) and bf (balance factor) — bf turns red when it hits ±2. Amber is the node being processed, blue is the pivot or an ancestor still waiting to be checked, green is the newly inserted value, and nodes glide to their new positions during a rotation.",
        lineMap: { javascript: { start: 27, compare: 29, duplicate: 31, insert: 28, 'update-height': 33, balance: 34, 'rotate-ll': 36, 'rotate-rr': 37, 'rotate-lr-left': 39, 'rotate-lr-right': 40, 'rotate-rl-right': 43, 'rotate-rl-left': 44, done: 46 }, python: { start: 35, compare: 38, duplicate: 43, insert: 37, 'update-height': 45, balance: 46, 'rotate-ll': 49, 'rotate-rr': 51, 'rotate-lr-left': 53, 'rotate-lr-right': 54, 'rotate-rl-right': 56, 'rotate-rl-left': 57, done: 58 }, cpp: { start: 35, compare: 37, duplicate: 39, insert: 36, 'update-height': 41, balance: 42, 'rotate-ll': 44, 'rotate-rr': 45, 'rotate-lr-left': 47, 'rotate-lr-right': 48, 'rotate-rl-right': 51, 'rotate-rl-left': 52, done: 54 } },
        complexities: { worst: "O(log n)", space: "O(n)" },
        code: {
            javascript: `function height(node) {
    return node ? node.height : 0;
}

function balanceFactor(node) {
    return height(node.left) - height(node.right);
}

function rotateRight(y) {
    const x = y.left;
    y.left = x.right;
    x.right = y;
    y.height = 1 + Math.max(height(y.left), height(y.right));
    x.height = 1 + Math.max(height(x.left), height(x.right));
    return x;
}

function rotateLeft(x) {
    const y = x.right;
    x.right = y.left;
    y.left = x;
    x.height = 1 + Math.max(height(x.left), height(x.right));
    y.height = 1 + Math.max(height(y.left), height(y.right));
    return y;
}

function insert(node, value) {
    if (node === null) return { value, left: null, right: null, height: 1 };
    if (value < node.value) node.left = insert(node.left, value);
    else if (value > node.value) node.right = insert(node.right, value);
    else return node; // no duplicates

    node.height = 1 + Math.max(height(node.left), height(node.right));
    const balance = balanceFactor(node);

    if (balance > 1 && value < node.left.value) return rotateRight(node); // LL
    if (balance < -1 && value > node.right.value) return rotateLeft(node); // RR
    if (balance > 1 && value > node.left.value) { // LR
        node.left = rotateLeft(node.left);
        return rotateRight(node);
    }
    if (balance < -1 && value < node.right.value) { // RL
        node.right = rotateRight(node.right);
        return rotateLeft(node);
    }
    return node;
}`,
            python: `class Node:
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None
        self.height = 1


def height(node):
    return node.height if node else 0


def balance_factor(node):
    return height(node.left) - height(node.right)


def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    y.height = 1 + max(height(y.left), height(y.right))
    x.height = 1 + max(height(x.left), height(x.right))
    return x


def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    x.height = 1 + max(height(x.left), height(x.right))
    y.height = 1 + max(height(y.left), height(y.right))
    return y


def insert(node, value):
    if node is None:
        return Node(value)
    if value < node.value:
        node.left = insert(node.left, value)
    elif value > node.value:
        node.right = insert(node.right, value)
    else:
        return node  # no duplicates

    node.height = 1 + max(height(node.left), height(node.right))
    balance = balance_factor(node)

    if balance > 1 and value < node.left.value:
        return rotate_right(node)  # LL
    if balance < -1 and value > node.right.value:
        return rotate_left(node)  # RR
    if balance > 1 and value > node.left.value:  # LR
        node.left = rotate_left(node.left)
        return rotate_right(node)
    if balance < -1 and value < node.right.value:  # RL
        node.right = rotate_right(node.right)
        return rotate_left(node)
    return node`,
            cpp: `struct Node {
    int value;
    Node* left;
    Node* right;
    int height;
    Node(int v) : value(v), left(nullptr), right(nullptr), height(1) {}
};

int height(Node* node) {
    return node ? node->height : 0;
}

int balanceFactor(Node* node) {
    return height(node->left) - height(node->right);
}

Node* rotateRight(Node* y) {
    Node* x = y->left;
    y->left = x->right;
    x->right = y;
    y->height = 1 + max(height(y->left), height(y->right));
    x->height = 1 + max(height(x->left), height(x->right));
    return x;
}

Node* rotateLeft(Node* x) {
    Node* y = x->right;
    x->right = y->left;
    y->left = x;
    x->height = 1 + max(height(x->left), height(x->right));
    y->height = 1 + max(height(y->left), height(y->right));
    return y;
}

Node* insert(Node* node, int value) {
    if (node == nullptr) return new Node(value);
    if (value < node->value) node->left = insert(node->left, value);
    else if (value > node->value) node->right = insert(node->right, value);
    else return node; // no duplicates

    node->height = 1 + max(height(node->left), height(node->right));
    int balance = balanceFactor(node);

    if (balance > 1 && value < node->left->value) return rotateRight(node); // LL
    if (balance < -1 && value > node->right->value) return rotateLeft(node); // RR
    if (balance > 1 && value > node->left->value) { // LR
        node->left = rotateLeft(node->left);
        return rotateRight(node);
    }
    if (balance < -1 && value < node->right->value) { // RL
        node->right = rotateRight(node->right);
        return rotateLeft(node);
    }
    return node;
}`
        }
    },

    // --- 5.2 Tree Traversals (generator-driven; opened via the BST workspace) --- //
    // Each entry's lineMap keys are the phases yielded by inorderSteps /
    // preorderSteps / postorderSteps in js/structures/tree.js.

    "tree-inorder": {
        title: "In-Order Traversal",
        category: "tree",
        type: "tree",
        description: "In-Order Traversal visits a binary tree in Left \u2192 Node \u2192 Right order. On a Binary Search Tree this produces the values in ascending sorted order.\n\n1. Recursively traverse the left subtree.\n\n2. Visit the current node.\n\n3. Recursively traverse the right subtree.\n\nWhen a child is empty, the recursion simply returns to its parent.\n\nOn screen: amber is the node being processed, blue nodes are ancestors still waiting on the recursion stack, green nodes are already visited, and the small numbers show visit order.",
        lineMap: { javascript: { start: 1, 'null-child': 2, 'go-left': 3, visit: 4, 'go-right': 5, done: 6 }, python: { start: 1, 'null-child': 3, 'go-left': 4, visit: 5, 'go-right': 6, done: 7 }, cpp: { start: 1, 'null-child': 2, 'go-left': 3, visit: 4, 'go-right': 5, done: 6 } },
        complexities: { worst: "O(n)", space: "O(h)" },
        code: {
            javascript: `function inorder(node, result = []) {
    if (node === null) return result;
    inorder(node.left, result);
    result.push(node.value);
    inorder(node.right, result);
    return result;
}`,
            python: `def inorder(node, result):
    if node is None:
        return result
    inorder(node.left, result)
    result.append(node.value)
    inorder(node.right, result)
    return result`,
            cpp: `void inorder(Node* node, vector<int>& result) {
    if (node == nullptr) return;
    inorder(node->left, result);
    result.push_back(node->value);
    inorder(node->right, result);
}`
        }
    },

    "tree-preorder": {
        title: "Pre-Order Traversal",
        category: "tree",
        type: "tree",
        description: "Pre-Order Traversal visits a binary tree in Node \u2192 Left \u2192 Right order. The root always comes first, which makes it ideal for copying a tree or saving its structure.\n\n1. Visit the current node.\n\n2. Recursively traverse the left subtree.\n\n3. Recursively traverse the right subtree.\n\nWhen a child is empty, the recursion simply returns to its parent.\n\nOn screen: amber is the node being processed, green nodes are already visited, and the small numbers show visit order.",
        lineMap: { javascript: { start: 1, 'null-child': 2, visit: 3, 'go-left': 4, 'go-right': 5, done: 6 }, python: { start: 1, 'null-child': 3, visit: 4, 'go-left': 5, 'go-right': 6, done: 7 }, cpp: { start: 1, 'null-child': 2, visit: 3, 'go-left': 4, 'go-right': 5, done: 6 } },
        complexities: { worst: "O(n)", space: "O(h)" },
        code: {
            javascript: `function preorder(node, result = []) {
    if (node === null) return result;
    result.push(node.value);
    preorder(node.left, result);
    preorder(node.right, result);
    return result;
}`,
            python: `def preorder(node, result):
    if node is None:
        return result
    result.append(node.value)
    preorder(node.left, result)
    preorder(node.right, result)
    return result`,
            cpp: `void preorder(Node* node, vector<int>& result) {
    if (node == nullptr) return;
    result.push_back(node->value);
    preorder(node->left, result);
    preorder(node->right, result);
}`
        }
    },

    "tree-postorder": {
        title: "Post-Order Traversal",
        category: "tree",
        type: "tree",
        description: "Post-Order Traversal visits a binary tree in Left \u2192 Right \u2192 Node order. Children are always visited before their parent, which makes it ideal for deleting a tree bottom-up or evaluating expression trees.\n\n1. Recursively traverse the left subtree.\n\n2. Recursively traverse the right subtree.\n\n3. Visit the current node.\n\nWhen a child is empty, the recursion simply returns to its parent.\n\nOn screen: amber is the node being processed, blue nodes are ancestors still waiting on the recursion stack, green nodes are already visited, and the small numbers show visit order.",
        lineMap: { javascript: { start: 1, 'null-child': 2, 'go-left': 3, 'go-right': 4, visit: 5, done: 6 }, python: { start: 1, 'null-child': 3, 'go-left': 4, 'go-right': 5, visit: 6, done: 7 }, cpp: { start: 1, 'null-child': 2, 'go-left': 3, 'go-right': 4, visit: 5, done: 6 } },
        complexities: { worst: "O(n)", space: "O(h)" },
        code: {
            javascript: `function postorder(node, result = []) {
    if (node === null) return result;
    postorder(node.left, result);
    postorder(node.right, result);
    result.push(node.value);
    return result;
}`,
            python: `def postorder(node, result):
    if node is None:
        return result
    postorder(node.left, result)
    postorder(node.right, result)
    result.append(node.value)
    return result`,
            cpp: `void postorder(Node* node, vector<int>& result) {
    if (node == nullptr) return;
    postorder(node->left, result);
    postorder(node->right, result);
    result.push_back(node->value);
}`
        }
    },

    /* ==========================================
       6. GRAPH
       ========================================== */

    "graph-operations": {
        title: "Graph (BFS & DFS)",
        category: "graph",
        type: "graph",
        description: "A Graph is a set of nodes (vertices) connected by edges — used to model networks, maps, dependencies, and relationships. This is an undirected graph, represented as an adjacency list: each node keeps a list of the nodes it's directly connected to.\n\nBreadth-First Search (BFS): explore level by level using a queue — visit all of a node's neighbors before moving further out. Finds the shortest path (by edge count) in an unweighted graph.\n\nDepth-First Search (DFS): explore as far as possible down one path before backtracking, using a stack (or recursion). Useful for detecting cycles and exploring all reachable nodes.",
        complexities: { worst: "O(V + E)", space: "O(V)" },
        code: {
            javascript: `class Graph {
    constructor() {
        this.adjList = new Map();
    }

    addNode(id) {
        if (!this.adjList.has(id)) this.adjList.set(id, []);
    }

    addEdge(u, v) {
        this.adjList.get(u).push(v);
        this.adjList.get(v).push(u); // undirected
    }

    bfs(start) {
        const visited = new Set([start]);
        const queue = [start];
        const order = [];

        while (queue.length > 0) {
            const node = queue.shift();
            order.push(node);
            for (const neighbor of this.adjList.get(node)) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        return order;
    }

    dfs(start, visited = new Set(), order = []) {
        visited.add(start);
        order.push(start);
        for (const neighbor of this.adjList.get(start)) {
            if (!visited.has(neighbor)) {
                this.dfs(neighbor, visited, order);
            }
        }
        return order;
    }
}`,
            python: `from collections import deque

class Graph:
    def __init__(self):
        self.adj_list = {}

    def add_node(self, id):
        if id not in self.adj_list:
            self.adj_list[id] = []

    def add_edge(self, u, v):
        self.adj_list[u].append(v)
        self.adj_list[v].append(u)  # undirected

    def bfs(self, start):
        visited = {start}
        queue = deque([start])
        order = []

        while queue:
            node = queue.popleft()
            order.append(node)
            for neighbor in self.adj_list[node]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        return order

    def dfs(self, start, visited=None, order=None):
        if visited is None:
            visited = set()
            order = []
        visited.add(start)
        order.append(start)
        for neighbor in self.adj_list[start]:
            if neighbor not in visited:
                self.dfs(neighbor, visited, order)
        return order`,
            cpp: `class Graph {
    unordered_map<string, vector<string>> adjList;
public:
    void addNode(string id) {
        if (adjList.find(id) == adjList.end()) adjList[id] = {};
    }

    void addEdge(string u, string v) {
        adjList[u].push_back(v);
        adjList[v].push_back(u); // undirected
    }

    vector<string> bfs(string start) {
        unordered_set<string> visited{start};
        queue<string> q;
        q.push(start);
        vector<string> order;

        while (!q.empty()) {
            string node = q.front(); q.pop();
            order.push_back(node);
            for (auto& neighbor : adjList[node]) {
                if (!visited.count(neighbor)) {
                    visited.insert(neighbor);
                    q.push(neighbor);
                }
            }
        }
        return order;
    }

    void dfsHelper(string node, unordered_set<string>& visited, vector<string>& order) {
        visited.insert(node);
        order.push_back(node);
        for (auto& neighbor : adjList[node]) {
            if (!visited.count(neighbor)) {
                dfsHelper(neighbor, visited, order);
            }
        }
    }
};`
        }
    },

    // --- 6.1 Graph Traversals (generator-driven; opened via the Graph workspace) --- //
    // Each entry's lineMap keys are the phases yielded by bfsSteps / dfsSteps
    // in js/structures/graph.js. `graph` in the snippets is an adjacency list:
    // an object mapping each node to the array of its neighbors.

    "graph-bfs": {
        title: "Breadth-First Search (BFS)",
        category: "graph",
        type: "graph",
        description: "Breadth-First Search explores a graph level by level: every neighbor of the start node first, then their neighbors, and so on. It uses a queue, and finds the shortest path (by edge count) in an unweighted graph.\n\n1. Mark the start node visited and enqueue it.\n\n2. Dequeue the front node and visit it.\n\n3. For each neighbor not yet visited, mark it visited and enqueue it.\n\n4. Repeat until the queue is empty.\n\nOn screen: amber is the node being processed, blue nodes are waiting in the queue, green nodes are fully processed, green edges show how each node was discovered, and the small numbers show visit order.",
        lineMap: { javascript: { start: 3, dequeue: 7, visit: 8, 'check-neighbor': 11, enqueue: 13, done: 17 }, python: { start: 5, dequeue: 9, visit: 10, 'check-neighbor': 13, enqueue: 15, done: 17 }, cpp: { start: 4, dequeue: 9, visit: 10, 'check-neighbor': 13, enqueue: 15, done: 19 } },
        complexities: { worst: "O(V + E)", space: "O(V)" },
        code: {
            javascript: `function bfs(graph, start) {
    const visited = new Set([start]);
    const queue = [start];
    const order = [];

    while (queue.length > 0) {
        const node = queue.shift();
        order.push(node);

        for (const neighbor of graph[node]) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return order;
}`,
            python: `from collections import deque

def bfs(graph, start):
    visited = {start}
    queue = deque([start])
    order = []

    while queue:
        node = queue.popleft()
        order.append(node)

        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    return order`,
            cpp: `vector<string> bfs(unordered_map<string, vector<string>>& graph, const string& start) {
    unordered_set<string> visited{start};
    queue<string> q;
    q.push(start);
    vector<string> order;

    while (!q.empty()) {
        string node = q.front();
        q.pop();
        order.push_back(node);

        for (const string& neighbor : graph[node]) {
            if (!visited.count(neighbor)) {
                visited.insert(neighbor);
                q.push(neighbor);
            }
        }
    }
    return order;
}`
        }
    },

    "graph-dfs": {
        title: "Depth-First Search (DFS)",
        category: "graph",
        type: "graph",
        description: "Depth-First Search explores as far as possible down one path before backtracking. It uses recursion (the call stack), and is useful for detecting cycles and exploring every node reachable from a start node.\n\n1. Visit the current node and mark it visited.\n\n2. For each neighbor not yet visited, recurse into it.\n\n3. When a node has no unvisited neighbors left, backtrack to the node that called it.\n\nOn screen: amber is the node being processed, blue nodes are still open on the recursion stack, green nodes are finished (backtracked out), green edges show the path DFS took, and the small numbers show visit order.",
        lineMap: { javascript: { start: 1, visit: 3, 'check-neighbor': 6, recurse: 7, backtrack: 10, done: 10 }, python: { start: 1, visit: 6, 'check-neighbor': 9, recurse: 10, backtrack: 12, done: 12 }, cpp: { start: 1, visit: 4, 'check-neighbor': 7, recurse: 8, backtrack: 11, done: 11 } },
        complexities: { worst: "O(V + E)", space: "O(V)" },
        code: {
            javascript: `function dfs(graph, node, visited = new Set(), order = []) {
    visited.add(node);
    order.push(node);

    for (const neighbor of graph[node]) {
        if (!visited.has(neighbor)) {
            dfs(graph, neighbor, visited, order);
        }
    }
    return order;
}`,
            python: `def dfs(graph, node, visited=None, order=None):
    if visited is None:
        visited, order = set(), []

    visited.add(node)
    order.append(node)

    for neighbor in graph[node]:
        if neighbor not in visited:
            dfs(graph, neighbor, visited, order)

    return order`,
            cpp: `void dfs(unordered_map<string, vector<string>>& graph, const string& node,
         unordered_set<string>& visited, vector<string>& order) {
    visited.insert(node);
    order.push_back(node);

    for (const string& neighbor : graph[node]) {
        if (!visited.count(neighbor)) {
            dfs(graph, neighbor, visited, order);
        }
    }
}`
        }
    },

};

export { algorithmDatabase };
