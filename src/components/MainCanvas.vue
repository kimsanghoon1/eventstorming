<script setup lang="ts">
import { store } from '../store';
import EventCanvas from './EventCanvas.vue';
import UmlCanvas from './UmlCanvas.vue';
</script>

<template>
  <div v-if="store.activeBoard">
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
</template>

<style scoped>
.no-board-selected, .loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  flex-direction: column;
  color: #6c757d;
}
div {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
