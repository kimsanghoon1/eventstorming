<script setup lang="ts">
import { store } from './store';
import BoardSwitcher from './components/BoardSwitcher.vue';
import EventCanvas from './components/EventCanvas.vue';
import UmlCanvas from './components/UmlCanvas.vue';
</script>

<template>
  <div id="layout">
    <header>
      <BoardSwitcher />
    </header>
    <main>
      <div v-if="store.activeBoard">
        <EventCanvas v-if="store.currentView === 'event-canvas'" :key="store.activeBoard" />
        <UmlCanvas v-else-if="store.currentView === 'uml-canvas'" :key="store.activeBoard" />
      </div>
      <div v-else class="no-board-selected">
        <h2>No Board Selected</h2>
        <p>Create a new board or select one to start.</p>
      </div>
    </main>
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  overflow: hidden; /* Prevent body scroll */
}
</style>

<style scoped>
#layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
header {
  flex-shrink: 0;
}
main {
  flex-grow: 1;
  overflow: auto; /* Allow main content to scroll if needed */
}
.no-board-selected {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  flex-direction: column;
  color: #6c757d;
}
</style>