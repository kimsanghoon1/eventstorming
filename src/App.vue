<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <RouterView />
</template>

<style>
/* Resetting global styles that might interfere with the new layout */
#app {
  display: block;
  height: auto;
  overflow: visible;
}
</style>
