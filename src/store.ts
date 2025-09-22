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
  boards: Array<{ name: string, type: string, savedAt: string, snapshotUrl: string | null }>;
  umlBoards: Array<{ name: string, type: string, savedAt: string, snapshotUrl: string | null }>;
  activeBoard: string | null;
  activeStage: any | null; // To hold the Konva stage reference
  
  // Y.js related state
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  undoManager: Y.UndoManager | null;
  canvasItems: Y.Array<Y.Map<any>> | null;
  connections: Y.Array<Y.Map<any>> | null;
  boardType: Y.Text | null;

  reactiveItems: CanvasItem[];
  reactiveConnections: Connection[];

  isCodeGeneratorOpen: boolean;
  toggleCodeGenerator: (isOpen: boolean) => void;

  currentView: 'event-canvas' | 'uml-canvas' | 'loading';

  // Methods
  fetchBoards: () => Promise<void>;
  fetchUmlBoards: () => Promise<void>;
  loadBoard: (name: string) => Promise<void>;
  unloadBoard: () => void;
  createNewBoard: (name: string, boardType: 'Eventstorming' | 'UML') => Promise<void>;
  deleteBoard: (name: string) => Promise<void>;
  setActiveStage: (stage: any) => void;
  
  addItem: (item: Omit<CanvasItem, 'id'>) => void;
  updateItem: (item: CanvasItem) => void;
  deleteItems: (ids: number[]) => void;
  addConnection: (connection: Omit<Connection, 'id' | 'type'> & { type?: string }) => void;
  deleteConnections: (ids: string[]) => void;
  updateConnection: (connection: Connection) => void;
  syncAttributesToChildren: (aggregateId: number) => void;

  createTestObjects: () => void;
  undo: () => void;
  redo: () => void;
  saveActiveBoard: () => Promise<void>;
  saveBoardHeadless: (boardName: string, boardData: any, boardType: 'Eventstorming' | 'UML') => Promise<void>;
  reverseEngineerCode: (zipFile: File | null) => Promise<{ eventstormingBoardName: string, umlBoardName: string }>;
}

export const store = reactive<Store>({
  boards: [],
  umlBoards: [],
  activeBoard: null,
  activeStage: null,
  
  doc: null,
  provider: null,
  undoManager: null,
  canvasItems: null,
  connections: null,
  boardType: null,

  reactiveItems: [],
  reactiveConnections: [],

  isCodeGeneratorOpen: false,

  currentView: 'loading',

  toggleCodeGenerator(isOpen: boolean) {
    this.isCodeGeneratorOpen = isOpen;
  },

  setActiveStage(stage: any) {
    this.activeStage = stage;
  },

  unloadBoard() {
    if (this.provider) {
      this.provider.destroy();
    }
    if (this.doc) {
      this.doc.destroy();
    }
    this.activeBoard = null;
    this.doc = null;
    this.provider = null;
    this.canvasItems = null;
    this.connections = null;
    this.boardType = null;
    this.reactiveItems = [];
    this.reactiveConnections = [];
    this.fetchBoards(); // Refresh the board list
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
    } catch (error) {
      console.error("Failed to fetch boards:", error);
    }
  },

  async fetchUmlBoards() {
    try {
      const response = await fetch('/api/boards/uml');
      this.umlBoards = await response.json();
    } catch (error) {
      console.error("Failed to fetch UML boards:", error);
    }
  },

  async loadBoard(name: string) {
    if (this.activeBoard === name && this.doc) { // also check for doc to prevent no-op
        return;
    }

    // Clean up previous board connection if it exists
    if (this.provider) this.provider.destroy();
    if (this.doc) this.doc.destroy();

    this.activeBoard = name;
    this.currentView = 'loading';

    try {
        const doc = new Y.Doc();
        this.doc = doc;
        this.canvasItems = doc.getArray<Y.Map<any>>('canvasItems');
        this.connections = doc.getArray<Y.Map<any>>('connections');
        this.boardType = doc.getText('boardType');

        this.provider = new WebsocketProvider('ws://localhost:3000', name, doc);

        this.provider.on('synced', async (isSynced: boolean) => {
            if (isSynced && this.canvasItems?.length === 0) {
                // 1. Fetch initial data from REST API only if the doc is empty after sync
                console.log('Document is empty after sync, fetching initial state from REST API...');
                try {
                    const response = await fetch(`/api/boards/${name}`);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch board: ${response.statusText}`);
                    }
                    const boardData = await response.json();

                    // 2. Populate the doc
                    doc.transact(() => {
                        (boardData.items || []).forEach((item: any) => this.canvasItems!.push([toYMap(item)]));
                        (boardData.connections || []).forEach((conn: any) => this.connections!.push([toYMap(conn)]));
                        if (boardData.boardType && this.boardType!.length === 0) {
                            this.boardType!.insert(0, boardData.boardType);
                        }
                    });
                } catch (e) {
                    console.error("Failed to fetch initial board state:", e);
                }
            }
            // This will now be populated, triggering the initial render
            this.reactiveItems = this.canvasItems!.toJSON();
            this.reactiveConnections = this.connections!.toJSON();
            const type = this.boardType!.toString();
            if (type) {
                this.currentView = type === 'UML' ? 'uml-canvas' : 'event-canvas';
            }
        });

        // Set up update handler for subsequent changes from any client
        doc.on('update', () => {
            if (this.canvasItems && this.connections) {
              this.reactiveItems = this.canvasItems.toJSON();
              this.reactiveConnections = this.connections.toJSON();
            }
        });
        
        this.undoManager = new Y.UndoManager([this.canvasItems, this.connections]);

    } catch (error) {
        console.error("Failed to load board:", error);
        this.activeBoard = null;
        this.currentView = 'event-canvas'; // Fallback
    }
  },

  async createNewBoard(name: string, boardType: 'Eventstorming' | 'UML') {
    if (this.boards.some(b => b.name === name) || !name.trim()) {
      alert('Invalid or duplicate board name.');
      return;
    }
    
    const boardData = {
      items: [],
      connections: [],
      boardType: boardType,
      snapshot: null,
    };
    await fetch(`/api/boards/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boardData),
    });

    await this.fetchBoards();
    // Navigation is now handled by the component
  },

  async deleteBoard(name: string) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    await fetch(`/api/boards/${name}`, { method: 'DELETE' });
    if (this.activeBoard === name) {
      this.unloadBoard();
    } else {
      await this.fetchBoards();
    }
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
      if (!this.connections || !this.doc) return;
      this.doc.transact(() => {
        const idsSet = new Set(ids);
        let i = this.connections!.length;
        while (i--) {
            const conn = this.connections!.get(i);
            if (idsSet.has(conn.get('id'))) {
                this.connections!.delete(i, 1);
            }
        }
      });
  },

  deleteItemsAndAttachedConnections(ids: number[]) {
    if (!this.doc || !this.canvasItems || !this.connections) return;

    this.doc.transact(() => {
      const idsSet = new Set(ids);

      // 1. Delete items
      let i = this.canvasItems!.length;
      while (i--) {
        const item = this.canvasItems!.get(i);
        if (idsSet.has(item.get('id'))) {
          this.canvasItems!.delete(i, 1);
        }
      }

      // 2. Delete attached connections
      let j = this.connections!.length;
      while (j--) {
        const conn = this.connections!.get(j);
        if (idsSet.has(conn.get('from')) || idsSet.has(conn.get('to'))) {
          this.connections!.delete(j, 1);
        }
      }
    });
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

  syncAttributesToChildren(aggregateId: number) {
    if (!this.canvasItems) return;

    const aggregate = this.reactiveItems.find(i => i.id === aggregateId);
    if (!aggregate || aggregate.type !== 'Aggregate' || !aggregate.attributes) {
      console.warn('Target is not a valid aggregate or has no attributes.');
      return;
    }

    const parentContextId = aggregate.parent;
    if (parentContextId === null) return;

    const childrenToUpdate = this.reactiveItems.filter(item => 
      item.parent === parentContextId &&
      ['Command', 'Event', 'Policy'].includes(item.type)
    );

    this.doc?.transact(() => {
      childrenToUpdate.forEach(child => {
        const updatedChild = { ...child, attributes: aggregate.attributes };
        this.updateItem(updatedChild);
      });
    });

    alert(`${childrenToUpdate.length} child items have been updated with attributes from ${aggregate.instanceName}.`);
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

  async saveActiveBoard() {
    if (!this.activeBoard || !this.doc || !this.activeStage) {
      alert("No active board or stage to save.");
      return;
    }

    // Generate snapshot
    const snapshot = this.activeStage.toDataURL({ pixelRatio: 0.1 });

    const boardData = {
      items: this.doc.getArray('canvasItems').toJSON(),
      connections: this.doc.getArray('connections').toJSON(),
      boardType: this.doc.getText('boardType').toString(),
      snapshot: snapshot,
    };

    try {
      const response = await fetch(`/api/boards/${this.activeBoard}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(boardData),
        });
      if (!response.ok) {
        throw new Error('Save failed');
      }
      alert('Board saved successfully!');
      await this.fetchBoards(); // Refresh board list to show new snapshot
    } catch (error) {
      console.error('Failed to save board:', error);
      alert('Error saving board.');
    }
  },

  async saveBoardHeadless(boardName: string, boardData: any, boardType: 'Eventstorming' | 'UML') {
    try {
      const response = await fetch('/api/headless-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardName,
          boardData,
          boardType,
        }),
      });
      if (!response.ok) {
        throw new Error(`Headless save failed for ${boardName}`);
      }
    } catch (error) {
      console.error('Failed to save board headless:', error);
      throw error;
    }
  },

  async reverseEngineerCode(zipFile: File | null) {
    // Helper function to create, save, and destroy a board doc
    const createAndSaveBoard = async (name: string, type: 'Eventstorming' | 'UML', model: any) => {
      const doc = new Y.Doc();
      const canvasItems = doc.getArray<Y.Map<any>>('canvasItems');
      const connections = doc.getArray<Y.Map<any>>('connections');
      const boardTypeText = doc.getText('boardType');

      doc.transact(() => {
        boardTypeText.insert(0, type);
        (model.items || []).forEach(item => canvasItems.push([toYMap(item)]));
        (model.connections || []).forEach(conn => connections.push([toYMap(conn)]));
      });

      // Use the headless save which doesn't rely on `this.activeStage`
      await this.saveBoardHeadless(name, {
        items: canvasItems.toJSON(),
        connections: connections.toJSON(),
      }, type);
      
      doc.destroy();
    };

    let requestBody;
    const headers = {};

    if (zipFile) {
      const formData = new FormData();
      formData.append('zipFile', zipFile);
      requestBody = formData;
    } else {
      // For local testing with a hard-coded file on the server, send an empty body
      requestBody = JSON.stringify({});
      headers['Content-Type'] = 'application/json';
    }


    try {
      // 2. Call the API
      const response = await fetch('/api/reverse-engineer', {
        method: 'POST',
        headers,
        body: requestBody,
      });
      if (!response.ok) throw new Error('Failed to reverse engineer code');
      const { eventstormingModel, umlModels } = await response.json();

      const timestamp = Date.now();

      // Save Eventstorming model to a new board
      const eventstormingBoardName = `ReversedEventstorming-${timestamp}`;
      await createAndSaveBoard(eventstormingBoardName, 'Eventstorming', eventstormingModel);

      // Save each UML model to its own new board
      const umlBoardNames = [];
      for (const umlModel of umlModels) {
        // Use a more robust name, fallback to timestamp if no items
        const namePart = umlModel.items?.[0]?.instanceName?.replace(/\s+/g, '') || timestamp;
        const umlBoardName = `ReversedUML-${namePart}`;
        await createAndSaveBoard(umlBoardName, 'UML', umlModel);
        umlBoardNames.push(umlBoardName);
      }
      
      // Load the eventstorming board to view it
      await this.loadBoard(eventstormingBoardName);
      
      return { eventstormingBoardName, umlBoardNames };
    } catch (error: any) {
      console.error('Failed to reverse engineer code:', error);
      throw error;
    }
  },
});
