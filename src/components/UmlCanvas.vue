<script setup lang="ts">
import { store } from '../store';
</script>

<template>
  <div>
    <h1>UML Canvas for Aggregate ID: {{ store.editingAggregateId }}</h1>
    <button @click="store.showEventCanvas()">Back to Event Canvas</button>
  </div>
</template>

<style scoped>
</style>
