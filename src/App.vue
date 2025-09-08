<script setup lang="ts">
import { store } from './store';
import BoardSwitcher from './components/BoardSwitcher.vue';
import MainCanvas from './components/MainCanvas.vue';
import CodeGeneratorDialog from './components/CodeGeneratorDialog.vue';
</script>

<template>
  <div id="layout">
    <header>
      <BoardSwitcher />
    </header>
    <main>
      <MainCanvas />
    </main>
    <CodeGeneratorDialog v-if="store.isCodeGeneratorOpen" />
  </div>
</template>

<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  overflow: hidden;
}

#app {
    height: 100%;
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
  z-index: 20; /* Ensure header is above canvas actions */
}

main {
  flex-grow: 1;
  position: relative; /* Needed for canvas actions positioning */
  overflow: hidden; /* Prevent scrolling in main area */
}
</style>
