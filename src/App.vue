<script setup lang="ts">
import { store } from './store';
import BoardSwitcher from './components/BoardSwitcher.vue';
import MainCanvas from './components/MainCanvas.vue';
import CodeGenerator from './components/CodeGenerator.vue';
</script>

<template>
  <div id="layout">
    <header>
      <BoardSwitcher />
    </header>
    <main>
      <template v-if="store.mainView === 'canvas'">
        <MainCanvas />
      </template>
      <template v-else-if="store.mainView === 'code-generator'">
        <CodeGenerator />
      </template>
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
  overflow: auto; /* Allow scrolling for code generator view */
}
</style>
