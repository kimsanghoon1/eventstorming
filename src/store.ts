import { reactive } from 'vue';
import type { CanvasItem, Connection } from './types';

interface Store {
  boards: string[];
  activeBoard: string | null;
  canvasItems: CanvasItem[];
  connections: Connection[];
  fetchBoards: () => Promise<void>;
  loadBoard: (name: string) => Promise<void>;
  saveCurrentBoard: () => Promise<void>;
  createNewBoard: (name: string) => Promise<void>;
  deleteBoard: (name: string) => Promise<void>;
}

export const store = reactive<Store>({
  boards: [],
  activeBoard: null,
  canvasItems: [],
  connections: [],

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
  },

  async deleteBoard(name: string) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    await fetch(`/api/boards/${name}`, { method: 'DELETE' });
    if (this.activeBoard === name) {
      this.activeBoard = null;
      this.canvasItems = [];
      this.connections = [];
    }
    await this.fetchBoards();
  },
});
