# AlgoVision
**Interactive Data Structures & Algorithms Visualizer**

🔗 **[Live Demo](https://sorting-visualizer-sable-rho.vercel.app/)**

---

## 📌 Overview
AlgoVision is an interactive DSA visualization platform supporting searching, sorting, stacks, queues, binary search trees, and graph traversal. Built with a focus on step-by-step execution control and synchronized source-code tracking, it turns abstract algorithm logic into an inspectable debugging experience.

---

## 🚀 Key Architectural Features

* **Generator-Based Execution Engine:** Algorithms are implemented using ES6 generators (`function*` and `yield`). This isolates algorithm logic from DOM rendering and caches immutable execution snapshots, enabling $O(1)$ backward and forward state navigation without rewinding loops.
* **Synchronized Code Tracking:** A custom phase-mapping architecture maps JavaScript generator states to corresponding source lines in JavaScript, Python, and C++, accurately tracking execution across languages without arbitrary code compilation.
* **Robust Async Control:** Implements cancellation/version guards (`workspaceGeneration`) to aggressively orphan pending asynchronous operations, preventing stale UI updates and race conditions during rapid workspace or playback changes.
* **Dynamic SVG Layouts:** 
  * *Binary Search Tree:* Node coordinates are computed dynamically via in-order index ($x$) and recursion depth ($y$).
  * *Graph:* Nodes are mapped evenly across a circular layout using dynamic trigonometric offsets ($(r \cos \theta, r \sin \theta)$).
* **Modern UI Architecture:** Features a custom 60/40 split-pane desktop layout with a flush, non-floating control dock. Built purely on CSS Grid and Flexbox with a scalable CSS elevation/color token system—zero external CSS frameworks used.

---

## 🧩 Supported Modules

| Category | Algorithm / Structure | Operations / Mode | Rendering Engine | Time Complexity | Space Complexity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Search** | Linear & Binary Search | Step-by-step target search with active bounds | DOM Array Blocks | $O(n)$, $O(\log n)$ | $O(1)$ |
| **Sort** | Bubble, Selection, Insertion, Merge, Quick | Step-by-step comparison, swap, and partition tracing | DOM Array Blocks | $O(n^2)$ to $O(n \log n)$ | $O(1)$ to $O(n)$ |
| **Stack** | LIFO Stack | Live interactive Push, Pop, Peek, Clear | Vertical Flexbox | $O(1)$ per op | $O(n)$ |
| **Queue** | FIFO Queue | Live interactive Enqueue, Dequeue, Peek, Clear | Horizontal Flexbox | $O(1)$ per op | $O(n)$ |
| **Tree** | Binary Search Tree | Insert, Search, 3-Case Delete, Traversals (In/Pre/Post) | Dynamic SVG | $O(h)$ | $O(n)$ |
| **Graph** | Undirected Graph | Add Node/Edge, Animated BFS & DFS, Randomize | Dynamic SVG | $O(V + E)$ | $O(V)$ |

---

## 📂 Project Structure

```text
algovision/
├── index.html                 # Single-page application shell and screen routing
├── style.css                  # Design system tokens, 60/40 split-pane layout, media queries
└── js/
    ├── app.js                 # UI controller, workspace setup, and async token guards
    ├── data.js                # Algorithm database, multi-language snippets, and line maps
    ├── visualizer.js          # Shared StepPlayer execution engine and playback cache
    ├── algorithms/
    │   ├── search.js          # Generator-based search logic
    │   └── sorting.js         # Generator-based sorting logic
    └── structures/
        ├── stack.js           # Live LIFO stack engine
        ├── queue.js           # Live FIFO queue engine
        ├── tree.js            # Live SVG BST engine with traversals & deletion
        └── graph.js           # Live SVG Graph engine with BFS/DFS
```

---

## 🛠️ Local Setup & Quickstart

AlgoVision has **zero external dependencies** (no Node modules, no build steps, no package managers required). 

```bash
# 1. Clone the repository
git clone [https://github.com/your-username/algovision.git](https://github.com/your-username/algovision.git)

# 2. Navigate to the project directory
cd algovision

# 3. Serve the application locally
# Option A: Using Python (built-in to macOS/Linux/Windows)
python3 -m http.server 8000

# Option B: Using Node.js serve
npx serve .
```
*Navigate to `http://localhost:8000` or the port provided by your server to view the app.*

---

## 🤝 Contributing

Contributions are welcome! To add a new algorithm or data structure:

1. **Fork** the repository.
2. **Create a feature branch:** `git checkout -b feature/your-feature-name`
3. **Implement your changes:**
   * **Step algorithms:** Add generators to `js/algorithms/`
   * **Persistent structures:** Add interactive engines to `js/structures/`
   * **Database & Snippets:** Register metadata, multi-language snippets, and line maps in `js/data.js`
4. **Test locally:** Open `index.html` via a local server to verify step execution, CSS grid layout, and responsive mobile behavior.
5. **Commit and open a Pull Request.**
```