<script setup lang="ts">
import { computed } from 'vue';
import type { CanvasItem } from '../types';
import { store } from '../store';

const props = defineProps({
  modelValue: {
    type: Object as () => CanvasItem | null,
    required: true,
  },
  visible: {
    type: Boolean,
    required: true,
  }
});

const emit = defineEmits(['close']);

const children = computed(() => {
  if (!props.modelValue) return [];
  return store.canvasItems.filter(item => item.parent === props.modelValue!.id);
});

const close = () => {
  emit('close');
};
</script>

<template>
  <div v-if="visible" class="dialog-overlay" @click.self="close">
    <div class="dialog-content">
      <h3 v-if="modelValue">{{ modelValue.instanceName }} Children</h3>
      <button @click="close" class="close-btn">&times;</button>
      <ul>
        <li v-for="child in children" :key="child.id">
          {{ child.instanceName }} ({{ child.type }})
        </li>
      </ul>
      <p v-if="children.length === 0">No items in this context.</p>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.dialog-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
  min-width: 300px;
  max-width: 500px;
  position: relative;
}
.close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}
</style>
