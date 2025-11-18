<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

type FolderItem = {
  type: 'folder';
  path: string;
  name: string;
};

type BoardItem = {
  id?: string;
  boardId: string;
  name: string;
  type: string;
  savedAt: string;
  snapshotUrl: string | null;
};

type ListItem = FolderItem | BoardItem;

const API_BASE = 'http://localhost:3000';

const router = useRouter();

const items = ref<ListItem[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const currentPath = ref('');

const allFolders = ref<string[]>([]);

const showModelModal = ref(false);
const prompt = ref('I want to model a microservice architecture for an online shopping mall.');
const isCreatingModel = ref(false);
const creationError = ref<string | null>(null);

const showNewBoardModal = ref(false);
const newBoardName = ref('');
const newBoardType = ref<'Eventstorming' | 'UML'>('Eventstorming');
const newBoardPath = ref('');
const isCreatingBoard = ref(false);
const newBoardError = ref<string | null>(null);

const showFolderModal = ref(false);
const newFolderName = ref('');
const newFolderParent = ref('');
const isCreatingFolder = ref(false);
const newFolderError = ref<string | null>(null);

const showMoveModal = ref(false);
const itemToMove = ref<ListItem | null>(null);
const moveTargetPath = ref('');
const isMovingItem = ref(false);
const moveError = ref<string | null>(null);

const draggingItem = ref<ListItem | null>(null);
const dropTarget = ref<string | null>(null);

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  item: null as ListItem | null,
});

const isFolder = (item: ListItem): item is FolderItem => item.type === 'folder';

const parentPath = computed(() => {
  if (!currentPath.value) return null;
  const normalized = currentPath.value.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
});

const formatFolderLabel = (pathValue: string) => {
  if (!pathValue) return '/';
  return `/${pathValue.replace(/\\/g, '/')}`;
};

const itemFolderPath = (item: ListItem) => {
  if (isFolder(item)) return item.path;
  const normalized = item.boardId.replace(/\\/g, '/');
  const parts = normalized.split('/');
  parts.pop();
  return parts.join('/');
};

const availableMoveTargets = computed(() => {
  const uniqueTargets = Array.from(new Set(['', ...allFolders.value.map(folder => folder.replace(/\\/g, '/'))]));
  if (!itemToMove.value) return uniqueTargets;

  const blocked = new Set<string>();
  const sourceFolder = itemFolderPath(itemToMove.value).replace(/\\/g, '/');
  blocked.add(sourceFolder || '');

  if (isFolder(itemToMove.value)) {
    const selfPath = itemToMove.value.path.replace(/\\/g, '/');
    blocked.add(selfPath);
    uniqueTargets.forEach(target => {
      const normalized = target.replace(/\\/g, '/');
      if (normalized && normalized.startsWith(`${selfPath}/`)) {
        blocked.add(target);
      }
    });
  }

  return uniqueTargets.filter(target => !blocked.has(target));
});

const fetchFolders = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/folders?recursive=true`);
    if (!response.ok) {
      throw new Error('Failed to fetch folders');
    }
    const folderList: string[] = await response.json();
    allFolders.value = folderList.filter(folder => folder !== 'snapshots');
  } catch (err) {
    console.error('Failed to fetch folders:', err);
    allFolders.value = [];
  }
};

const fetchItems = async () => {
  try {
    isLoading.value = true;
    error.value = null;
    const response = await fetch(`${API_BASE}/api/boards?path=${encodeURIComponent(currentPath.value)}`);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    items.value = (await response.json()) as ListItem[];
    await fetchFolders();
  } catch (err: any) {
    console.error('Failed to fetch items:', err);
    error.value = `Failed to load items. Is the server running? (${err.message})`;
  } finally {
    isLoading.value = false;
  }
};

const openBoard = (boardId: string) => {
  router.push({ name: 'board-view', params: { boardId } });
};

const navigateTo = (path: string) => {
  currentPath.value = path;
  fetchItems();
};

const deleteBoard = async (item: ListItem) => {
  if (isFolder(item)) return;
  if (!confirm(`Are you sure you want to delete "${item.name}"?`)) {
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/boards/${item.boardId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete the board.');
    }
    await fetchItems();
  } catch (err: any) {
    console.error('Error deleting board:', err);
    alert(`Error: ${err.message}`);
  }
};

const deleteFolder = async (folder: FolderItem) => {
  if (!folder.path) {
    alert('Cannot delete the root folder.');
    return;
  }
  if (!confirm(`Delete folder "${folder.name}" and everything inside it?`)) {
    return;
  }
  try {
    const encodedPath = folder.path
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');
    const response = await fetch(`${API_BASE}/api/folders/${encodedPath}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete the folder.');
    }
    await fetchItems();
  } catch (err: any) {
    console.error('Error deleting folder:', err);
    alert(`Error: ${err.message}`);
  }
};

const openCreateModelModal = () => {
  prompt.value =
    'I want to model a microservice architecture for an online shopping mall. The system should include services for user management (registration, login), product catalog (viewing products, categories), and order management (placing orders, viewing order history).';
  creationError.value = null;
  showModelModal.value = true;
};

const handleCreateModel = async () => {
  if (!prompt.value.trim()) {
    creationError.value = 'Prompt cannot be empty.';
    return;
  }
  isCreatingModel.value = true;
  creationError.value = null;
  try {
    const response = await axios.post(`${API_BASE}/api/create-model`, {
      prompt: prompt.value,
    });
    if (response.status === 200) {
      showModelModal.value = false;
      await fetchItems();
      alert('Model created successfully! The new board should now be in the list.');
    } else {
      throw new Error(response.data.error || 'Failed to create model.');
    }
  } catch (err: any) {
    console.error('Failed to create model:', err);
    creationError.value = `Error: ${err.response?.data?.details || err.message || 'An unknown error occurred.'}`;
  } finally {
    isCreatingModel.value = false;
  }
};

const openNewBoardModal = () => {
  newBoardName.value = '';
  newBoardType.value = 'Eventstorming';
  newBoardPath.value = currentPath.value;
  newBoardError.value = null;
  showNewBoardModal.value = true;
};

const handleCreateBlankBoard = async () => {
  if (!newBoardName.value.trim()) {
    newBoardError.value = 'Board name is required.';
    return;
  }
  isCreatingBoard.value = true;
  newBoardError.value = null;
  try {
    const response = await fetch(`${API_BASE}/api/boards/create-empty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newBoardName.value.trim(),
        boardType: newBoardType.value,
        path: newBoardPath.value,
      }),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error || 'Failed to create board.');
    }
    const result = await response.json();
    showNewBoardModal.value = false;
    await fetchItems();
    openBoard(result.boardId);
  } catch (err: any) {
    console.error('Failed to create blank board:', err);
    newBoardError.value = err.message || 'Unknown error occurred.';
  } finally {
    isCreatingBoard.value = false;
  }
};

const openFolderCreationModal = () => {
  newFolderName.value = '';
  newFolderParent.value = currentPath.value;
  newFolderError.value = null;
  showFolderModal.value = true;
};

const handleCreateFolder = async () => {
  if (!newFolderName.value.trim()) {
    newFolderError.value = 'Folder name is required.';
    return;
  }
  isCreatingFolder.value = true;
  newFolderError.value = null;
  try {
    const fullPath = [newFolderParent.value, newFolderName.value.trim()]
      .filter(Boolean)
      .join('/')
      .replace(/\/\/+/g, '/');
    const response = await fetch(`${API_BASE}/api/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath }),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error || 'Failed to create folder.');
    }
    showFolderModal.value = false;
    await fetchItems();
  } catch (err: any) {
    console.error('Failed to create folder:', err);
    newFolderError.value = err.message || 'Unknown error occurred.';
  } finally {
    isCreatingFolder.value = false;
  }
};

const openMoveDialog = (item: ListItem) => {
  itemToMove.value = item;
  moveError.value = null;
  showMoveModal.value = true;
  moveTargetPath.value = availableMoveTargets.value[0] ?? '';
};

const moveEntity = async (sourcePath: string, destinationPath: string) => {
  const response = await fetch(`${API_BASE}/api/items/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourcePath,
      destinationPath,
    }),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error || 'Failed to move item.');
  }
};

const handleMoveItem = async () => {
  if (!itemToMove.value) return;
  if (availableMoveTargets.value.length === 0) {
    moveError.value = 'No available destinations.';
    return;
  }
  isMovingItem.value = true;
  moveError.value = null;
  try {
    const sourcePath = isFolder(itemToMove.value) ? itemToMove.value.path : itemToMove.value.boardId;
    await moveEntity(sourcePath, moveTargetPath.value);
    showMoveModal.value = false;
    itemToMove.value = null;
    await fetchItems();
  } catch (err: any) {
    console.error('Failed to move item:', err);
    moveError.value = err.message || 'Unknown error occurred.';
  } finally {
    isMovingItem.value = false;
  }
};

const canDropOnFolder = (folderPath: string, item: ListItem) => {
  const normalizedFolder = (folderPath || '').replace(/\\/g, '/');
  const currentLocation = itemFolderPath(item).replace(/\\/g, '/');
  if (normalizedFolder === currentLocation) return false;
  if (isFolder(item)) {
    const itemPath = item.path.replace(/\\/g, '/');
    if (normalizedFolder === itemPath) return false;
    if (normalizedFolder.startsWith(`${itemPath}/`)) return false;
  }
  return true;
};

const handleDragStart = (event: DragEvent, item: ListItem) => {
  draggingItem.value = item;
  dropTarget.value = null;
  event.dataTransfer?.setData('text/plain', item.name);
  event.dataTransfer?.setDragImage?.(event.currentTarget as Element, 50, 50);
};

const handleDragOverFolder = (event: DragEvent, folder: FolderItem) => {
  if (!draggingItem.value) return;
  if (!canDropOnFolder(folder.path, draggingItem.value)) return;
  event.preventDefault();
  dropTarget.value = folder.path;
};

const handleDropOnFolder = async (folder: FolderItem) => {
  if (!draggingItem.value) return;
  if (!canDropOnFolder(folder.path, draggingItem.value)) {
    resetDragState();
    return;
  }
  await moveViaDrag(folder.path);
};

const handleDragOverParent = (event: DragEvent) => {
  if (!draggingItem.value || parentPath.value === null) return;
  if (!canDropOnFolder(parentPath.value, draggingItem.value)) return;
  event.preventDefault();
  dropTarget.value = parentPath.value;
};

const handleDropOnParent = async () => {
  if (!draggingItem.value || parentPath.value === null) {
    resetDragState();
    return;
  }
  if (!canDropOnFolder(parentPath.value, draggingItem.value)) {
    resetDragState();
    return;
  }
  await moveViaDrag(parentPath.value);
};

const moveViaDrag = async (destinationPath: string) => {
  if (!draggingItem.value) return;
  try {
    const sourcePath = isFolder(draggingItem.value) ? draggingItem.value.path : draggingItem.value.boardId;
    await moveEntity(sourcePath, destinationPath);
    await fetchItems();
  } catch (err) {
    console.error('Failed to move item via drag & drop:', err);
    alert('Failed to move item. Please try again.');
  } finally {
    resetDragState();
  }
};

const handleDragEnd = () => {
  resetDragState();
};

const resetDragState = () => {
  draggingItem.value = null;
  dropTarget.value = null;
};

const openContextMenu = (event: MouseEvent, item: ListItem) => {
  event.preventDefault();
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    item,
  };
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
  contextMenu.value.item = null;
};

const handleContextAction = (action: 'open' | 'move' | 'delete') => {
  const item = contextMenu.value.item;
  if (!item) return;

  if (action === 'open') {
    if (isFolder(item)) {
      navigateTo(item.path);
    } else {
      openBoard(item.boardId);
    }
  }

  if (action === 'move') {
    openMoveDialog(item);
  }

  if (action === 'delete') {
    if (isFolder(item)) {
      deleteFolder(item);
    } else {
      deleteBoard(item);
    }
  }

  closeContextMenu();
};

const handleGlobalClick = () => {
  if (contextMenu.value.visible) {
    closeContextMenu();
  }
};

onMounted(() => {
  fetchItems();
  document.addEventListener('click', handleGlobalClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick);
});
</script>

<template>
  <div class="board-list-view">
    <header class="header">
      <div class="header-left">
        <h1 v-if="!currentPath">My Boards</h1>
        <div v-else class="breadcrumbs">
          <button class="breadcrumb-btn" @click="navigateTo('')">Home</button>
          <span v-for="(part, index) in currentPath.split(/[\\/]/).filter(Boolean)" :key="index" class="breadcrumb-part">
            / {{ part }}
          </span>
        </div>
      </div>
      <div class="header-actions">
        <button class="secondary-btn" @click="openCreateModelModal" style="font-size: 1rem; color: #fafaf8; background-color: #4CAF50">
          <svg xmlns="http://www.w3.org/2000/svg" :width="'1em'" :height="'1em'" viewBox="0 0 20 20" fill="currentColor" style="vertical-align: middle;">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          <span style="vertical-align: middle; margin-left: 0.4em;">Create Model With LLM</span>
        </button>
        <button class="secondary-btn" @click="openNewBoardModal" style="font-size: 1rem; color: #fafaf8; background-color: #4CAF50">
          <svg xmlns="http://www.w3.org/2000/svg" :width="'1em'" :height="'1em'" viewBox="0 0 20 20" fill="currentColor" style="vertical-align: middle;">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          <span style="vertical-align: middle; margin-left: 0.4em;">New Canvas</span>
        </button>
        <button class="secondary-btn" @click="openFolderCreationModal">
          New Folder
        </button>
      </div>
    </header>

    <div v-if="isLoading" class="loading">Loading boards...</div>
    <div v-if="error" class="error-message">{{ error }}</div>

    <div v-if="!isLoading && !error" class="board-grid">
      <!-- "Up" folder -->
      <div
        v-if="parentPath !== null"
        class="board-card folder-card"
        :class="{ 'drop-target': dropTarget === parentPath }"
        @click="navigateTo(parentPath!)"
        @dragover.prevent="handleDragOverParent"
        @drop.prevent="handleDropOnParent"
      >
        <div class="card-content">
          <div class="folder-icon">..</div>
          <div class="board-info">
            <h2 class="board-name">Up to parent</h2>
          </div>
        </div>
      </div>
      
      <div
        v-for="item in items"
        :key="isFolder(item) ? item.path : item.boardId"
        class="board-card"
        :class="{ 'drop-target': isFolder(item) && dropTarget === item.path }"
        draggable="true"
        @dragstart="handleDragStart($event, item)"
        @dragend="handleDragEnd"
        @contextmenu.prevent="openContextMenu($event, item)"
      >
        <!-- Folder Card -->
        <div
          v-if="isFolder(item)"
          class="card-content folder-card"
          @click="navigateTo(item.path)"
          @dragover.prevent="handleDragOverFolder($event, item)"
          @drop.prevent="handleDropOnFolder(item)"
        >
          <div class="folder-icon">📁</div>
           <div class="board-info">
            <h2 class="board-name">{{ item.name }}</h2>
          </div>
        </div>

        <!-- Board Card -->
        <div v-else>
          <div class="card-content" @click="openBoard(item.boardId)">
            <img 
              :src="item.snapshotUrl ? `${API_BASE}${item.snapshotUrl}` : '/No-Image-Placeholder.svg'" 
              alt="Board snapshot" 
              class="board-snapshot"
              @error="($event.target as HTMLImageElement).src = '/No-Image-Placeholder.svg'"
            />
            <div class="board-info">
              <h2 class="board-name">{{ item.name }}</h2>
              <p class="board-type">{{ item.type }}</p>
              <p class="board-date">Saved: {{ new Date(item.savedAt).toLocaleString() }}</p>
            </div>
          </div>
          <button class="delete-btn" @click.stop="deleteBoard(item)" title="Delete board">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
              <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- New Modal for Creating Model -->
  <div v-if="showModelModal" class="modal-overlay">
    <div class="modal-content">
      <h2>Create New Model with LLM</h2>
      <p>Enter a prompt describing the system you want to model. The orchestrator will generate an Eventstorming board and corresponding UML diagrams.</p>
      
      <textarea v-model="prompt" placeholder="e.g., I want to model an online library system..."></textarea>
      
      <div v-if="creationError" class="error-message modal-error">{{ creationError }}</div>

      <div class="modal-actions">
        <button class="secondary-btn" @click="showModelModal = false" :disabled="isCreatingModel">Cancel</button>
        <button class="primary-btn" @click="handleCreateModel" :disabled="isCreatingModel">
          <span v-if="!isCreatingModel">Generate</span>
          <span v-else class="spinner"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Blank board modal -->
  <div v-if="showNewBoardModal" class="modal-overlay">
    <div class="modal-content">
      <h2>Create Blank Canvas</h2>
      <p>Start from an empty Eventstorming or UML canvas by choosing a name and destination folder.</p>
      <label class="modal-label">
        Name
        <input v-model="newBoardName" type="text" placeholder="e.g., CustomerJourney" />
      </label>
      <label class="modal-label">
        Board Type
        <select v-model="newBoardType">
          <option value="Eventstorming">Eventstorming</option>
          <option value="UML">UML</option>
        </select>
      </label>
      <label class="modal-label">
        Folder
        <select v-model="newBoardPath">
          <option value="">/</option>
          <option v-for="folder in allFolders" :key="folder" :value="folder">
            {{ formatFolderLabel(folder) }}
          </option>
        </select>
      </label>
      <div v-if="newBoardError" class="error-message modal-error">{{ newBoardError }}</div>
      <div class="modal-actions">
        <button class="secondary-btn" @click="showNewBoardModal = false" :disabled="isCreatingBoard">Cancel</button>
        <button class="primary-btn" @click="handleCreateBlankBoard" :disabled="isCreatingBoard">
          <span v-if="!isCreatingBoard">Create</span>
          <span v-else class="spinner"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Folder modal -->
  <div v-if="showFolderModal" class="modal-overlay">
    <div class="modal-content">
      <h2>Create Folder</h2>
      <label class="modal-label">
        Parent Folder
        <select v-model="newFolderParent">
          <option value="">/</option>
          <option v-for="folder in allFolders" :key="folder" :value="folder">
            {{ formatFolderLabel(folder) }}
          </option>
        </select>
      </label>
      <label class="modal-label">
        Folder Name
        <input v-model="newFolderName" type="text" placeholder="e.g., domain/ordering" />
      </label>
      <div v-if="newFolderError" class="error-message modal-error">{{ newFolderError }}</div>
      <div class="modal-actions">
        <button class="secondary-btn" @click="showFolderModal = false" :disabled="isCreatingFolder">Cancel</button>
        <button class="primary-btn" @click="handleCreateFolder" :disabled="isCreatingFolder">
          <span v-if="!isCreatingFolder">Create</span>
          <span v-else class="spinner"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Move modal -->
  <div v-if="showMoveModal" class="modal-overlay">
    <div class="modal-content">
      <h2>Move "{{ itemToMove?.name }}"</h2>
      <p>Select the destination folder.</p>
      <label class="modal-label">
        Destination
        <select v-model="moveTargetPath">
          <option v-for="folder in availableMoveTargets" :key="folder || 'root'" :value="folder">
            {{ formatFolderLabel(folder) }}
          </option>
        </select>
      </label>
      <div v-if="moveError" class="error-message modal-error">{{ moveError }}</div>
      <div class="modal-actions">
        <button class="secondary-btn" @click="showMoveModal = false" :disabled="isMovingItem">Cancel</button>
        <button class="primary-btn" @click="handleMoveItem" :disabled="isMovingItem || availableMoveTargets.length === 0">
          <span v-if="!isMovingItem">Move</span>
          <span v-else class="spinner"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Context menu -->
  <div
    v-if="contextMenu.visible"
    class="context-menu"
    :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
  >
    <button @click="handleContextAction('open')">Open</button>
    <button @click="handleContextAction('move')">Move</button>
    <button class="danger" @click="handleContextAction('delete')">Delete</button>
  </div>
</template>

<style scoped>
.board-list-view {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.header-left {
  display: flex;
  align-items: center;
}

.breadcrumbs {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-heading);
}

.breadcrumb-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  font-weight: 600;
  color: #4f46e5;
  cursor: pointer;
  padding: 0;
}
.breadcrumb-btn:hover {
  text-decoration: underline;
}
.breadcrumb-part {
  color: #64748b;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 1rem;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.header h1 {
  font-size: 2rem;
  font-weight: 600;
}

.create-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background-color: #4f46e5;
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}
.create-btn:hover {
  background-color: #4338ca;
}
.create-btn svg {
  width: 1.25rem;
  height: 1.25rem;
}

.secondary-btn {
  background-color: white;
  color: #475569;
  border: 1px solid #cbd5e1;
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}
.secondary-btn:hover:not(:disabled) {
  background-color: #f1f5f9;
}
.secondary-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #64748b;
}

.error-message {
  background-color: #fef2f2;
  color: #b91c1c;
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid #fecaca;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.board-card {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  overflow: hidden;
  background-color: white;
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  position: relative;
}

.board-card.drop-target {
  border-color: #4f46e5;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
}

.folder-card {
  cursor: pointer;
}

.folder-icon {
  font-size: 5rem;
  text-align: center;
  padding: 2rem 0;
  color: #94a3b8;
}

.board-card:hover {
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.card-content {
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
}

.board-snapshot {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 0.5rem;
}

.board-info {
  flex-grow: 1;
}

.board-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-heading);
  margin-bottom: 0.25rem;
}

.board-type {
  font-size: 0.875rem;
  color: #64748b;
  margin-bottom: 0.25rem;
}

.board-date {
  font-size: 0.75rem;
  color: #94a3b8;
}

.delete-btn {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.5rem;
  transition: background-color 0.2s;
}
.delete-btn:hover {
  background-color: #fef2f2;
}
.delete-btn svg {
  width: 1.25rem;
  height: 1.25rem;
  color: #ef4444;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  padding: 2rem;
  border-radius: 0.75rem;
  width: 90%;
  max-width: 720px;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.modal-content h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.modal-content p {
  color: #475569;
  margin-bottom: 1.5rem;
  text-align: center;
}
.modal-content textarea {
  width: 100%;
  min-height: 150px;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.75rem;
  font-family: inherit;
  font-size: 1rem;
  resize: vertical;
}
.modal-error {
    margin-top: 1rem;
}
.modal-actions {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}
.modal-actions button {
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}
.primary-btn {
  background-color: #4f46e5;
  color: white;
  min-width: 100px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.primary-btn:hover:not(:disabled) {
  background-color: #4338ca;
}
.primary-btn:disabled {
    background-color: #a5b4fc;
    cursor: not-allowed;
}

/* Spinner for loading state */
.spinner {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.modal-label {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-weight: 500;
  color: #475569;
  margin-bottom: 1rem;
}

.modal-label input,
.modal-label select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
}

.context-menu {
  position: fixed;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  box-shadow: 0 10px 20px rgba(0,0,0,0.1);
  z-index: 1010;
  display: flex;
  flex-direction: column;
  min-width: 160px;
}

.context-menu button {
  background: none;
  border: none;
  text-align: left;
  padding: 0.75rem 1rem;
  cursor: pointer;
  font-size: 0.95rem;
}

.context-menu button:hover {
  background-color: #f1f5f9;
}

.context-menu button.danger {
  color: #dc2626;
}

.context-menu button.danger:hover {
  background-color: #fee2e2;
}
</style>
