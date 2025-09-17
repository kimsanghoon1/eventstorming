<script setup lang="ts">
import { store } from '../store';
import EventCanvas from './EventCanvas.vue';
import UmlCanvas from './UmlCanvas.vue';
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
onMounted(() => {
  store.loadBoard(route.params.boardName as string);
});

const goBack = () => {
  router.push('/');
};
</script>



<template>
  <div class="canvas-container">
    <div class="canvas-actions">
        <button @click="goBack()" title="Back to Board List">🔙</button>
        <button @click="store.saveActiveBoard()" title="Save Board">💾</button>
        <button @click="store.toggleCodeGenerator(true)" title="Generate Code">💻</button>
    </div>
    <div v-if="store.activeBoard" class="canvas-wrapper">
      <div v-if="store.currentView === 'loading'" class="loading">
        <h2>Loading board...</h2>
      </div>
      <EventCanvas v-else-if="store.currentView === 'event-canvas'" :key="store.activeBoard" />
      <UmlCanvas v-else-if="store.currentView === 'uml-canvas'" :key="store.activeBoard" />
    </div>
    <div v-else class="no-board-selected">
      <h2>No Board Selected</h2>
      <p>Create a new board or select one to start.</p>
    </div>
  </div>
</template>

<style scoped>
.canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.canvas-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  display: flex;
  gap: 5px;
}

.canvas-actions button {
  background-color: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 8px;
  cursor: pointer;
  font-size: 16px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.canvas-actions button:hover {
  background-color: #f1f1f1;
}

.canvas-wrapper, .no-board-selected, .loading {
  width: 100%;
  height: 100%;
}

.no-board-selected, .loading {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  color: #6c757d;
}
</style>
