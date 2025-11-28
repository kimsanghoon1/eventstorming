<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { userStore } from '../stores/userStore';

const handleLogout = async () => {
  await userStore.signOut();
  router.push('/login');
};

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

const API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;

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

const currentView = ref<'dashboard' | 'projects'>('dashboard');
const isProjectsOpen = ref(true);

const toggleProjectsTree = () => {
  isProjectsOpen.value = !isProjectsOpen.value;
};

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
  <div class="flex h-screen w-full bg-background-light dark:bg-background-dark font-display text-gray-900 dark:text-white">
    <!-- SideNavBar -->
    <aside class="flex w-64 flex-col bg-white/5 dark:bg-black/20 p-4 border-r border-gray-200 dark:border-white/10">
      <div class="flex items-center gap-3 px-2 mb-8">
        <span class="material-symbols-outlined text-primary text-3xl">hub</span>
        <span class="text-xl font-bold">Diagramr</span>
      </div>
      <div class="flex h-full flex-col justify-between">
        <div class="flex flex-col gap-2">
          <div 
            class="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors duration-200"
            :class="currentView === 'dashboard' ? 'bg-primary/20 text-primary' : 'text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'"
            @click="currentView = 'dashboard'"
          >
            <span class="material-symbols-outlined" :class="{ 'fill': currentView === 'dashboard' }">dashboard</span>
            <p class="text-sm font-bold leading-normal">Dashboard</p>
          </div>
          
          <!-- All Projects (File Tree) -->
          <div class="flex flex-col gap-1">
            <div 
              class="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors duration-200"
              :class="currentView === 'projects' ? 'bg-primary/20 text-primary' : 'text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'"
              @click="toggleProjectsTree"
            >
              <span class="material-symbols-outlined">folder_open</span>
              <p class="text-sm font-medium leading-normal">All Projects</p>
              <span class="material-symbols-outlined ml-auto text-sm transition-transform" :class="{ 'rotate-90': isProjectsOpen }">chevron_right</span>
            </div>
            
            <div v-if="isProjectsOpen" class="pl-4 flex flex-col gap-1">
               <!-- File Tree Component Placeholder -->
               <div v-if="isLoading" class="text-xs text-gray-500 px-3">Loading...</div>
               <div v-else class="flex flex-col">
                  <div 
                    v-for="folder in allFolders" 
                    :key="folder"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer truncate"
                    @click="navigateTo(folder)"
                    :class="{ 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white': currentPath === folder }"
                  >
                    <span class="material-symbols-outlined text-base">folder</span>
                    <span class="truncate">{{ formatFolderLabel(folder) }}</span>
                  </div>
               </div>
            </div>
          </div>

          <div class="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 cursor-pointer">
            <span class="material-symbols-outlined">grid_view</span>
            <p class="text-sm font-medium leading-normal">Templates</p>
          </div>
          <div class="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 cursor-pointer">
            <span class="material-symbols-outlined">settings</span>
            <p class="text-sm font-medium leading-normal">Settings</p>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 cursor-pointer">
            <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-8 bg-gray-300"></div>
            <div class="flex flex-col">
              <h1 class="text-sm font-medium leading-tight">User</h1>
              <p class="text-xs font-normal leading-tight opacity-50">{{ userStore.user?.email || 'user@example.com' }}</p>
            </div>
          </div>
          <div @click="handleLogout" class="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 cursor-pointer">
            <span class="material-symbols-outlined">logout</span>
            <p class="text-sm font-medium leading-normal">Log out</p>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto">
      <div class="mx-auto max-w-7xl p-6 lg:p-8">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2">
            <!-- PageHeading & SearchBar -->
            <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
              <div class="flex min-w-72 flex-col gap-2">
                <p class="text-4xl font-black leading-tight tracking-[-0.033em]">Welcome back!</p>
                <p class="text-gray-500 dark:text-white/60 text-base font-normal leading-normal">Here's what's happening with your projects today.</p>
              </div>
              <div class="flex items-center gap-4">
                <label class="flex flex-col h-12 w-64">
                  <div class="flex w-full flex-1 items-stretch rounded-lg h-full bg-white dark:bg-white/5 border border-gray-200 dark:border-none">
                    <div class="text-gray-500 dark:text-white/60 flex items-center justify-center pl-4 rounded-l-lg">
                      <span class="material-symbols-outlined">search</span>
                    </div>
                    <input class="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg bg-transparent text-gray-900 dark:text-white focus:outline-0 focus:ring-0 border-none h-full placeholder:text-gray-500 dark:placeholder:text-white/60 px-4 rounded-l-none pl-2 text-base font-normal leading-normal" placeholder="Search projects..." value=""/>
                  </div>
                </label>
                <button @click="openNewBoardModal" class="flex min-w-[84px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg h-12 px-5 bg-primary text-white dark:text-background-dark text-sm font-bold leading-normal tracking-[0.015em] hover:bg-primary/90 transition-colors">
                  <span class="material-symbols-outlined">add_circle</span>
                  <span class="truncate">New Project</span>
                </button>
              </div>
            </div>

            <!-- SectionHeader & TextGrid -->
            <h2 class="text-[22px] font-bold leading-tight tracking-[-0.015em] pb-3 pt-5">Start a New Project</h2>
            <div class="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6">
              <div @click="openNewBoardModal" class="flex flex-1 gap-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[.02] p-5 flex-col hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-200 cursor-pointer shadow-sm dark:shadow-none">
                <div class="text-primary"><span class="material-symbols-outlined text-3xl">storm</span></div>
                <div class="flex flex-col gap-1">
                  <h2 class="text-base font-bold leading-tight">New Eventstorming Project</h2>
                  <p class="text-gray-500 dark:text-white/60 text-sm font-normal leading-normal">Map out complex business domains.</p>
                </div>
              </div>
              <div @click="openNewBoardModal" class="flex flex-1 gap-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[.02] p-5 flex-col hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-200 cursor-pointer shadow-sm dark:shadow-none">
                <div class="text-primary"><span class="material-symbols-outlined text-3xl">account_tree</span></div>
                <div class="flex flex-col gap-1">
                  <h2 class="text-base font-bold leading-tight">New UML Diagram</h2>
                  <p class="text-gray-500 dark:text-white/60 text-sm font-normal leading-normal">Visualize your system architecture.</p>
                </div>
              </div>
               <div @click="openCreateModelModal" class="flex flex-1 gap-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[.02] p-5 flex-col hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-200 cursor-pointer shadow-sm dark:shadow-none">
                <div class="text-primary"><span class="material-symbols-outlined text-3xl">auto_awesome</span></div>
                <div class="flex flex-col gap-1">
                  <h2 class="text-base font-bold leading-tight">Generate with AI</h2>
                  <p class="text-gray-500 dark:text-white/60 text-sm font-normal leading-normal">Create models from text description.</p>
                </div>
              </div>
            </div>

            <!-- Recent Projects Section -->
            <div class="flex items-center justify-between pb-3 pt-10">
               <h2 class="text-[22px] font-bold leading-tight tracking-[-0.015em]">
                 {{ currentPath ? `Folder: ${currentPath}` : 'Recent Projects' }}
               </h2>
               <div v-if="currentPath" class="flex gap-2">
                 <button @click="openFolderCreationModal" class="text-sm text-primary hover:underline">New Folder</button>
                 <button @click="navigateTo(parentPath || '')" class="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">Up</button>
               </div>
            </div>

            <div v-if="isLoading" class="py-8 text-center text-gray-500">Loading items...</div>
            <div v-else-if="error" class="py-8 text-center text-red-500">{{ error }}</div>
            
            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Folder Items -->
              <div 
                v-for="item in items.filter(isFolder)" 
                :key="item.path"
                class="group flex items-center gap-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[.02] p-4 hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-200 cursor-pointer shadow-sm dark:shadow-none"
                @click="navigateTo(item.path)"
                @dragover.prevent="handleDragOverFolder($event, item)"
                @drop.prevent="handleDropOnFolder(item)"
                @contextmenu.prevent="openContextMenu($event, item)"
              >
                 <span class="material-symbols-outlined text-3xl text-yellow-500">folder</span>
                 <div class="flex flex-col">
                    <h3 class="text-lg font-bold">{{ item.name }}</h3>
                    <p class="text-gray-500 dark:text-white/60 text-xs">Folder</p>
                 </div>
              </div>

              <!-- Board Items -->
              <div 
                v-for="item in (items.filter(i => !isFolder(i)) as BoardItem[])" 
                :key="item.boardId"
                class="group flex flex-col gap-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[.02] p-5 hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-200 cursor-pointer shadow-sm dark:shadow-none"
                draggable="true"
                @dragstart="handleDragStart($event, item)"
                @dragend="handleDragEnd"
                @contextmenu.prevent="openContextMenu($event, item)"
                @click="openBoard(item.boardId)"
              >
                <div class="flex-grow aspect-video bg-gray-100 dark:bg-white/5 rounded-lg overflow-hidden relative">
                  <img 
                    :src="item.snapshotUrl ? `${API_BASE}${item.snapshotUrl}` : '/No-Image-Placeholder.svg'" 
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    @error="($event.target as HTMLImageElement).src = '/No-Image-Placeholder.svg'"
                  />
                  <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button @click.stop="deleteBoard(item)" class="p-1 bg-red-500 text-white rounded hover:bg-red-600">
                        <span class="material-symbols-outlined text-sm">delete</span>
                     </button>
                  </div>
                </div>
                <div class="flex justify-between items-start">
                  <div>
                    <p class="text-gray-500 dark:text-white/60 text-xs font-medium uppercase tracking-wider">{{ item.type }}</p>
                    <h3 class="text-lg font-bold">{{ item.name }}</h3>
                    <p class="text-gray-500 dark:text-white/60 text-sm">Saved: {{ new Date(item.savedAt).toLocaleDateString() }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Right Sidebar (Activity) -->
          <div class="lg:col-span-1">
            <div class="bg-white dark:bg-white/5 rounded-xl p-6 sticky top-8 border border-gray-200 dark:border-white/10 shadow-sm dark:shadow-none">
              <h2 class="text-[22px] font-bold leading-tight tracking-[-0.015em] pb-4">Team Activity</h2>
              <div class="flex flex-col gap-5">
                <!-- Mock Activity Items -->
                <div class="flex gap-4">
                  <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 bg-gray-300"></div>
                  <div class="flex flex-col">
                    <p class="text-sm"><span class="font-bold">You</span> logged in</p>
                    <p class="text-gray-500 dark:text-white/50 text-xs mt-1">Just now</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Modals (Reused logic, styled) -->
    <div v-if="showModelModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-[#1e293b] rounded-xl p-6 w-full max-w-lg shadow-2xl border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-bold mb-4">Create New Model with LLM</h2>
        <p class="mb-4 text-gray-600 dark:text-gray-300">Enter a prompt describing the system you want to model.</p>
        <textarea v-model="prompt" class="w-full h-32 p-3 rounded-lg bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-white/10 focus:ring-2 focus:ring-primary focus:border-transparent resize-none mb-4" placeholder="e.g., I want to model an online library system..."></textarea>
        <div v-if="creationError" class="text-red-500 mb-4 text-sm">{{ creationError }}</div>
        <div class="flex justify-end gap-3">
          <button @click="showModelModal = false" class="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/5">Cancel</button>
          <button @click="handleCreateModel" class="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50" :disabled="isCreatingModel">
            {{ isCreatingModel ? 'Generating...' : 'Generate' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showNewBoardModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-[#1e293b] rounded-xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-bold mb-4">Create Blank Canvas</h2>
        <div class="flex flex-col gap-4">
          <label>
            <span class="block text-sm font-medium mb-1">Name</span>
            <input v-model="newBoardName" type="text" class="w-full p-2 rounded-lg bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-white/10 focus:ring-primary" placeholder="e.g., CustomerJourney" />
          </label>
          <label>
            <span class="block text-sm font-medium mb-1">Type</span>
            <select v-model="newBoardType" class="w-full p-2 rounded-lg bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-white/10 focus:ring-primary">
              <option value="Eventstorming">Eventstorming</option>
              <option value="UML">UML</option>
            </select>
          </label>
          <label>
            <span class="block text-sm font-medium mb-1">Folder</span>
            <select v-model="newBoardPath" class="w-full p-2 rounded-lg bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-white/10 focus:ring-primary">
              <option value="">/</option>
              <option v-for="folder in allFolders" :key="folder" :value="folder">{{ formatFolderLabel(folder) }}</option>
            </select>
          </label>
        </div>
        <div v-if="newBoardError" class="text-red-500 mt-4 text-sm">{{ newBoardError }}</div>
        <div class="flex justify-end gap-3 mt-6">
          <button @click="showNewBoardModal = false" class="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/5">Cancel</button>
          <button @click="handleCreateBlankBoard" class="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50" :disabled="isCreatingBoard">
            {{ isCreatingBoard ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showFolderModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-[#1e293b] rounded-xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-bold mb-4">Create Folder</h2>
        <div class="flex flex-col gap-4">
          <label>
            <span class="block text-sm font-medium mb-1">Parent Folder</span>
            <select v-model="newFolderParent" class="w-full p-2 rounded-lg bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-white/10 focus:ring-primary">
              <option value="">/</option>
              <option v-for="folder in allFolders" :key="folder" :value="folder">{{ formatFolderLabel(folder) }}</option>
            </select>
          </label>
          <label>
            <span class="block text-sm font-medium mb-1">Folder Name</span>
            <input v-model="newFolderName" type="text" class="w-full p-2 rounded-lg bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-white/10 focus:ring-primary" placeholder="e.g., domain/ordering" />
          </label>
        </div>
        <div v-if="newFolderError" class="text-red-500 mt-4 text-sm">{{ newFolderError }}</div>
        <div class="flex justify-end gap-3 mt-6">
          <button @click="showFolderModal = false" class="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/5">Cancel</button>
          <button @click="handleCreateFolder" class="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50" :disabled="isCreatingFolder">
            {{ isCreatingFolder ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- Move Modal -->
    <div v-if="showMoveModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-[#1e293b] rounded-xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-bold mb-4">Move "{{ itemToMove?.name }}"</h2>
        <label>
          <span class="block text-sm font-medium mb-1">Destination</span>
          <select v-model="moveTargetPath" class="w-full p-2 rounded-lg bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-white/10 focus:ring-primary">
            <option v-for="folder in availableMoveTargets" :key="folder || 'root'" :value="folder">{{ formatFolderLabel(folder) }}</option>
          </select>
        </label>
        <div v-if="moveError" class="text-red-500 mt-4 text-sm">{{ moveError }}</div>
        <div class="flex justify-end gap-3 mt-6">
          <button @click="showMoveModal = false" class="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/5">Cancel</button>
          <button @click="handleMoveItem" class="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50" :disabled="isMovingItem">
            {{ isMovingItem ? 'Moving...' : 'Move' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="fixed z-50 bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-lg shadow-xl py-1 min-w-[150px]"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }">

      <button @click="handleContextAction('open')" class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/5 text-sm">Open</button>
      <button @click="handleContextAction('move')" class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/5 text-sm">Move</button>
      <button @click="handleContextAction('delete')" class="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">Delete</button>
    </div>

  </div>
</template>

<style scoped>
/* Scrollbar customization if needed */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.dark ::-webkit-scrollbar-thumb {
  background: #475569;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
.dark ::-webkit-scrollbar-thumb:hover {
  background: #64748b;
}

.disabled {
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
