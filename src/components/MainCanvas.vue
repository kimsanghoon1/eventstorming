<script setup lang="ts">
import { useStore } from '@/store';
import EventCanvas from '@/components/EventCanvas.vue';
import UmlCanvas from '@/components/UmlCanvas.vue';
import type { CanvasItem } from '@/types';

const store = useStore();

const props = defineProps<{
  highlightedItemIds: Set<number>;
  clickedItemId: number | null;
}>();

const emit = defineEmits(['item-click', 'canvas-click', 'item-dblclick']);

const onItemClick = (itemId: number) => {
  emit('item-click', itemId);
};

const onItemDblClick = (item: CanvasItem) => {
  emit('item-dblclick', item);
};

const onCanvasClick = () => {
  emit('canvas-click');
};
</script>

<template>
  <div class="canvas-container bg-background-light dark:bg-background-dark">
    <div v-if="store.currentView === 'loading'" class="loading-overlay">
      <div class="spinner"></div>
      <p>Loading board...</p>
    </div>
    <EventCanvas 
      v-else-if="store.currentView === 'event-canvas'"
      :highlighted-item-ids="highlightedItemIds"
      :clicked-item-id="clickedItemId"
      @item-click="onItemClick"
      @item-dblclick="onItemDblClick"
      @canvas-click="onCanvasClick"
    />
    <UmlCanvas
      v-else-if="store.currentView === 'uml-canvas'"
      class="w-full h-full"
      :highlighted-item-ids="highlightedItemIds"
      :clicked-item-id="clickedItemId"
      @item-click="onItemClick"
      @item-dblclick="onItemDblClick"
      @canvas-click="onCanvasClick"
    />
    <div v-else class="loading-overlay">
      <p>Unknown board type or error.</p>
    </div>
  </div>
</template>

<style scoped>
.canvas-container {
  flex-grow: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  /* Removed centering to allow canvases to fill space */
  /* Removed fixed background color */
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-overlay p {
  margin-top: 1rem;
  font-size: 1.2rem;
  color: #555;
}
</style>
