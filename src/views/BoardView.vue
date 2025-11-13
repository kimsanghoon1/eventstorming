<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from '@/store';
import MainCanvas from '@/components/MainCanvas.vue';
import PropertiesPanel from '@/components/PropertiesPanel.vue';
import type { Connection } from '../types';
import type { CanvasItem } from '@/types/canvas';

const store = useStore();
const route = useRoute();
const router = useRouter();

const boardId = Array.isArray(route.params.boardId) ? route.params.boardId.join('/') : route.params.boardId;
const boardName = computed(() => {
  if (!boardId) return 'Unknown Board';
  const parts = boardId.split('/');
  return parts[parts.length - 1].replace('.json', '');
});

const selectedItem = computed(() => store.selectedItem);

// --- Highlighting Logic ---
const highlightedItemIds = ref(new Set<number>());
const clickedItemId = ref<number | null>(null);

const getDownstreamItemIds = (itemId: number, connections: readonly Connection[]): Set<number> => {
  const downstreamIds = new Set<number>();
  const queue: number[] = [itemId];
  const visited = new Set<number>([itemId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
    connections.forEach(conn => {
      if (conn.from === currentId && !visited.has(conn.to)) {
        downstreamIds.add(conn.to);
        visited.add(conn.to);
        queue.push(conn.to);
      }
    });
  }
  return downstreamIds;
};

const handleItemClick = (itemId: number) => {
  clickedItemId.value = itemId;
  highlightedItemIds.value = getDownstreamItemIds(itemId, store.reactiveConnections);
};

const handleItemDblClick = (item: CanvasItem) => {
  store.setSelectedItem(item);
};

const clearHighlight = () => {
  clickedItemId.value = null;
  highlightedItemIds.value = new Set();
  store.setSelectedItem(null);
};
// --- End Highlighting Logic ---


onMounted(() => {
  store.loadBoard(boardId);
});

onUnmounted(() => {
  store.unloadBoard();
});

const goBack = () => {
  router.push('/');
};
</script>

<template>
  <div class="board-view-container">
    <div class="board-header">
      <button @click="goBack" class="back-button">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
      </button>
      <h1 class="board-title">{{ boardName }}</h1>
      <div class="actions">
        <button @click="store.undo()" title="Undo (Ctrl+Z)" class="action-btn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5,8C9.85,8 7.45,9 5.6,10.6L2,7V16H11L7.38,12.38C8.77,11.22 10.54,10.5 12.5,10.5C16.04,10.5 19.05,12.81 20.1,16L22.47,15.22C21.08,11.03 17.15,8 12.5,8Z" /></svg>
        </button>
        <button @click="store.redo()" title="Redo (Ctrl+Y)" class="action-btn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4,10.6C16.55,9 14.15,8 11.5,8C6.85,8 2.92,11.03 1.54,15.22L3.9,16C4.95,12.81 7.95,10.5 11.5,10.5C13.45,10.5 15.23,11.22 16.62,12.38L13,16H22V7L18.4,10.6Z" /></svg>
        </button>
        <button @click="store.saveActiveBoard()" title="Save Board (Ctrl+S)" class="action-btn save-btn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17,3H5C3.89,3 3,3.9 3,5V19C3,20.1 3.9,21 5,21H19C20.1,21 21,20.1 21,19V7L17,3M19,19H5V5H16.17L19,7.83V19M12,12C10.34,12 9,13.34 9,15C9,16.66 10.34,18 12,18C13.66,18 15,16.66 15,15C15,13.34 13.66,12 12,12M6,6H15V10H6V6Z" /></svg>
          <span>Save</span>
        </button>
      </div>
    </div>
    <div class="board-content">
      <MainCanvas 
        :highlightedItemIds="highlightedItemIds" 
        :clickedItemId="clickedItemId" 
        @item-click="handleItemClick" 
        @item-dblclick="handleItemDblClick"
        @canvas-click="clearHighlight" 
      />
      <PropertiesPanel v-if="store.selectedItem" :selectedItem="store.selectedItem" />
    </div>
  </div>
</template>

<style scoped>
.board-view-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.board-header {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  flex-shrink: 0;
}

.back-button {
  margin-right: 1rem;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.back-button:hover {
  background-color: #e2e6ea;
}
.back-button svg {
  width: 24px;
  height: 24px;
}

.board-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  flex-grow: 1;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  background: none;
  border: 1px solid transparent;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.action-btn:hover {
  background-color: #e2e6ea;
  border-color: #dae0e5;
}
.action-btn svg {
  width: 20px;
  height: 20px;
}

.board-content {
  display: flex;
  flex-grow: 1;
  overflow: hidden; /* Prevent this container from creating scrollbars */
  position: relative; /* Make this a positioning context for the panel */
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column; /* This is to contain MainCanvas correctly */
  position: relative; /* Needed for MainCanvas to fill the space */
  min-width: 0; /* Important for flex-shrink to work correctly */
}
</style>
