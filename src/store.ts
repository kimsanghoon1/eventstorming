import { reactive } from 'vue';
import type { CanvasItem } from './types';

interface Store {
  boards: string[];
  activeBoard: string | null;
  canvasItems: CanvasItem[];
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

  async fetchBoards() {
    const response = await fetch('/api/boards');
    this.boards = await response.json();
    if (this.boards.length > 0 && !this.activeBoard) {
      this.loadBoard(this.boards[0]);
    }
  },

  async loadBoard(name: string) {
    const response = await fetch(`/api/boards/${name}`);
    this.canvasItems = await response.json();
    this.activeBoard = name;
  },

  async saveCurrentBoard() {
    if (!this.activeBoard) return;
    await fetch(`/api/boards/${this.activeBoard}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.canvasItems, null, 2),
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
    }
    await this.fetchBoards();
  },
});
