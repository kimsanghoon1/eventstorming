import { reactive, toRaw } from 'vue';
import type { CanvasItem, Connection } from './types';

interface HistoryState {
  canvasItems: CanvasItem[];
  connections: Connection[];
}

interface Store {
  boards: string[];
  activeBoard: string | null;
  canvasItems: CanvasItem[];
  connections: Connection[];
  history: HistoryState[];
  historyIndex: number;
  currentView: 'event-canvas' | 'uml-canvas';
  editingAggregateId: number | null;
  fetchBoards: () => Promise<void>;
  loadBoard: (name: string) => Promise<void>;
  saveCurrentBoard: () => Promise<void>;
  createNewBoard: (name: string) => Promise<void>;
  deleteBoard: (name: string) => Promise<void>;
  createTestObjects: () => void;
  pushState: () => void;
  undo: () => void;
  redo: () => void;
  showUmlCanvas: (aggregateId: number) => void;
  showEventCanvas: () => void;
}

export const store = reactive<Store>({
  boards: [],
  activeBoard: null,
  canvasItems: [],
  connections: [],
  history: [],
  historyIndex: -1,
  currentView: 'event-canvas',
  editingAggregateId: null,

  showUmlCanvas(aggregateId: number) {
    this.editingAggregateId = aggregateId;
    this.currentView = 'uml-canvas';
  },

  showEventCanvas() {
    this.editingAggregateId = null;
    this.currentView = 'event-canvas';
  },

  pushState() {
    // clear redo history
    if (this.historyIndex < this.history.length - 1) {
      this.history.splice(this.historyIndex + 1);
    }
    
    const state = {
      canvasItems: JSON.parse(JSON.stringify(toRaw(this.canvasItems))),
      connections: JSON.parse(JSON.stringify(toRaw(this.connections))),
    };
    this.history.push(state);
    this.historyIndex++;
  },

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const previousState = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
      this.canvasItems = previousState.canvasItems;
      this.connections = previousState.connections;
    }
  },

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const nextState = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
      this.canvasItems = nextState.canvasItems;
      this.connections = nextState.connections;
    }
  },

  async fetchBoards() {
    const response = await fetch('/api/boards');
    this.boards = await response.json();
    if (this.boards.length > 0 && !this.activeBoard) {
      await this.loadBoard(this.boards[0]);
    } else if (this.boards.length === 0) {
      this.activeBoard = null;
      this.canvasItems = [];
      this.connections = [];
    }
  },

  async loadBoard(name: string) {
    const response = await fetch(`/api/boards/${name}`);
    const data = await response.json();
    this.activeBoard = name;
    // Handle both old (array) and new (object) data structures
    if (Array.isArray(data)) {
      this.canvasItems = data;
      this.connections = [];
    } else {
      this.canvasItems = data.items || [];
      this.connections = data.connections || [];
    }
    this.history = [];
    this.historyIndex = -1;
    this.pushState();
  },

  async saveCurrentBoard() {
    if (!this.activeBoard) return;
    const boardData = {
      items: this.canvasItems,
      connections: this.connections,
    };
    await fetch(`/api/boards/${this.activeBoard}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(boardData, null, 2),
      }
    );
    alert(`${this.activeBoard} saved!`);
  },

  async createNewBoard(name: string) {
    if (this.boards.includes(name) || !name.trim()) {
      alert('Invalid or duplicate board name.');
      return;
    }
    this.canvasItems = [];
    this.connections = [];
    this.activeBoard = name;
    await this.saveCurrentBoard();
    await this.fetchBoards();
    this.history = [];
    this.historyIndex = -1;
    this.pushState();
  },

  async deleteBoard(name: string) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    await fetch(`/api/boards/${name}`, { method: 'DELETE' });
    if (this.activeBoard === name) {
      this.activeBoard = null;
      this.canvasItems = [];
      this.connections = [];
      this.history = [];
      this.historyIndex = -1;
    }
    await this.fetchBoards();
  },

  createTestObjects() {
    if (!this.activeBoard) {
      alert("Please select a board first.");
      return;
    }
    const items = [];
    const toolTypes = ["Command", "Event", "Aggregate", "Policy", "Actor", "ReadModel"];
    const stageWidth = 3000;
    const stageHeight = 3000;

    for (let i = 0; i < 1000; i++) {
      const type = toolTypes[Math.floor(Math.random() * toolTypes.length)];
      const newItem = {
        id: Date.now() + i,
        type: type,
        instanceName: `Test ${type} ${i}`,
        properties: [],
        x: Math.random() * stageWidth,
        y: Math.random() * stageHeight,
        width: 200,
        height: 100,
        rotation: 0,
        parent: null,
      };
      items.push(newItem);
    }
    this.canvasItems.push(...items);
    this.pushState();
    alert('Created 1000 test objects.');
  },
});
