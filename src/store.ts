import { reactive } from 'vue';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { CanvasItem, Connection, Property, UmlAttribute, UmlOperation } from './types';

// Helper to convert deep JS objects to Y.Map
const toYMap = (obj: Record<string, any>): Y.Map<any> => {
  const map = new Y.Map();
  for (const key in obj) {
    const value = obj[key];
    if (Array.isArray(value)) {
      map.set(key, toYArray(value));
    } else if (typeof value === 'object' && value !== null) {
      map.set(key, toYMap(value));
    } else {
      map.set(key, value);
    }
  }
  return map;
};

// Helper to convert deep JS arrays to Y.Array
const toYArray = (arr: any[]): Y.Array<any> => {
  const yArr = new Y.Array();
  arr.forEach(value => {
    if (Array.isArray(value)) {
      yArr.push([toYArray(value)]);
    } else if (typeof value === 'object' && value !== null) {
      yArr.push([toYMap(value)]);
    } else {
      yArr.push([value]);
    }
  });
  return yArr;
};


interface Store {
  boards: Array<{ name: string, type: string }>;
  activeBoard: string | null;
  
  // Y.js related state
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  undoManager: Y.UndoManager | null;
  canvasItems: Y.Array<Y.Map<any>> | null;
  connections: Y.Array<Y.Map<any>> | null;
  boardType: Y.Text | null;

  mainView: 'canvas' | 'code-generator';
  toggleView: () => void;

  currentView: 'event-canvas' | 'uml-canvas' | 'loading';

  // Methods
  fetchBoards: () => Promise<void>;
  loadBoard: (name: string) => Promise<void>;
  createNewBoard: (name: string, boardType: 'Eventstorming' | 'UML') => Promise<void>;
  deleteBoard: (name: string) => Promise<void>;
  
  addItem: (item: Omit<CanvasItem, 'id'>) => void;
  updateItem: (item: CanvasItem) => void;
  deleteItems: (ids: number[]) => void;
  addConnection: (connection: Omit<Connection, 'id' | 'type'> & { type?: string }) => void;
  deleteConnections: (ids: string[]) => void;
  updateConnection: (connection: Connection) => void;

  createTestObjects: () => void;
  undo: () => void;
  redo: () => void;
}

export const store = reactive<Store>({
  boards: [],
  activeBoard: null,
  
  doc: null,
  provider: null,
  undoManager: null,
  canvasItems: null,
  connections: null,
  boardType: null,

  currentView: 'loading',

  mainView: 'canvas',

  toggleView() {
    this.mainView = this.mainView === 'canvas' ? 'code-generator' : 'canvas';
  },

  undo() {
    this.undoManager?.undo();
  },

  redo() {
    this.undoManager?.redo();
  },

  async fetchBoards() {
    try {
      const response = await fetch('/api/boards');
      this.boards = await response.json();
      if (this.boards.length > 0 && !this.activeBoard) {
        await this.loadBoard(this.boards[0].name);
      } else if (this.boards.length === 0) {
        this.activeBoard = null;
        this.doc?.destroy();
        this.provider?.destroy();
        this.doc = null;
        this.provider = null;
        this.canvasItems = null;
        this.connections = null;
        this.currentView = 'loading';
      }
    } catch (error) {
      console.error("Failed to fetch boards:", error);
    }
  },

  async loadBoard(name: string) {
    if (this.activeBoard === name) {
        return;
    }

    if (this.provider) {
      this.provider.destroy();
    }
    if (this.doc) {
      this.doc.destroy();
    }

    this.activeBoard = name;
    this.currentView = 'loading';

    try {
        const response = await fetch(`/api/boards/${name}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch board: ${response.statusText}`);
        }
        const boardData = await response.json();

        const doc = new Y.Doc();
        const canvasItems = doc.getArray<Y.Map<any>>('canvasItems');
        const connections = doc.getArray<Y.Map<any>>('connections');
        const boardType = doc.getText('boardType');

        doc.transact(() => {
            (boardData.items || []).forEach((item: any) => canvasItems.push([toYMap(item)]));
            (boardData.connections || []).forEach((conn: any) => connections.push([toYMap(conn)]));
            if (boardData.boardType) {
                boardType.insert(0, boardData.boardType);
            }
        });

        this.doc = doc;
        this.canvasItems = canvasItems;
        this.connections = connections;
        this.boardType = boardType;
        this.undoManager = new Y.UndoManager([this.canvasItems, this.connections]);

        const type = this.boardType.toString();
        this.currentView = type === 'UML' ? 'uml-canvas' : 'event-canvas';

        this.provider = new WebsocketProvider('ws://localhost:3000', name, doc);

    } catch (error) {
        console.error("Failed to load board:", error);
        this.activeBoard = null;
        this.currentView = 'event-canvas'; // Fallback to a default view
    }
  },

  async createNewBoard(name: string, boardType: 'Eventstorming' | 'UML') {
    if (this.boards.some(b => b.name === name) || !name.trim()) {
      alert('Invalid or duplicate board name.');
      return;
    }
    
    // Create an empty board file on the server
    const boardData = {
      items: [],
      connections: [],
      boardType: boardType,
    };
    await fetch(`/api/boards/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boardData),
    });

    await this.fetchBoards();
    await this.loadBoard(name);
  },

  async deleteBoard(name: string) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    await fetch(`/api/boards/${name}`, { method: 'DELETE' });
    if (this.activeBoard === name) {
      this.activeBoard = null;
      this.doc?.destroy();
      this.provider?.destroy();
    }
    await this.fetchBoards();
  },

  addItem(item: Omit<CanvasItem, 'id'>) {
    if (!this.canvasItems) return;
    const newItemMap = toYMap({ ...item, id: Date.now() });
    this.canvasItems.push([newItemMap]);
  },

  updateItem(item: CanvasItem) {
    if (!this.canvasItems) return;
    const index = this.canvasItems.toArray().findIndex(i => i.get('id') === item.id);
    if (index > -1) {
      const yItem = this.canvasItems.get(index);
      this.doc?.transact(() => {
        for (const key in item) {
            const a = key as keyof CanvasItem;
            const value = item[a];
            if (Array.isArray(value)) {
                yItem.set(a, toYArray(value));
            } else {
                yItem.set(a, value);
            }
        }
      });
    }
  },

  deleteItems(ids: number[]) {
    if (!this.canvasItems) return;
    const idsSet = new Set(ids);
    let i = this.canvasItems.length;
    while (i--) {
      const item = this.canvasItems.get(i);
      if (idsSet.has(item.get('id'))) {
        this.canvasItems.delete(i, 1);
      }
    }
  },

  addConnection(connection: Omit<Connection, 'id'>) {
    if (!this.connections) return;
    const newConnMap = toYMap({ 
        ...connection, 
        id: `conn-${connection.from}-${connection.to}-${Date.now()}` 
    });
    this.connections.push([newConnMap]);
  },

  deleteConnections(ids: string[]) {
      if (!this.connections) return;
      const idsSet = new Set(ids);
      let i = this.connections.length;
      while (i--) {
          const conn = this.connections.get(i);
          if (idsSet.has(conn.get('id'))) {
              this.connections.delete(i, 1);
          }
      }
  },

  updateConnection(connection: Connection) {
    if (!this.connections) return;
    const index = this.connections.toArray().findIndex(c => c.get('id') === connection.id);
    if (index > -1) {
      const yConn = this.connections.get(index);
      this.doc?.transact(() => {
        yConn.set('sourceMultiplicity', connection.sourceMultiplicity);
        yConn.set('targetMultiplicity', connection.targetMultiplicity);
      });
    }
  },

  createTestObjects() {
    if (!this.activeBoard || !this.canvasItems) {
      alert("Please select a board first.");
      return;
    }
    const toolTypes = ["Command", "Event", "Aggregate", "Policy", "Actor", "ReadModel"];
    const stageWidth = 3000;
    const stageHeight = 3000;

    this.doc?.transact(() => {
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
            this.canvasItems!.push([toYMap(newItem)]);
        }
    });
    alert('Created 1000 test objects.');
  },
});