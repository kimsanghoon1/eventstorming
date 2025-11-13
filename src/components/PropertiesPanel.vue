<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useStore } from '@/store';
import { CanvasItem } from '@/types';

const store = useStore();
const props = defineProps<{
  selectedItem: CanvasItem | null;
}>();

const editableProperties = ref<Partial<CanvasItem>>({});

watch(() => props.selectedItem, (newItem) => {
  if (newItem) {
    editableProperties.value = { ...newItem };
  } else {
    editableProperties.value = {};
  }
}, { immediate: true });

const updateItem = () => {
  if (props.selectedItem) {
    store.updateItem(props.selectedItem.id, editableProperties.value);
  }
};

onMounted(() => {
  store.fetchUmlBoards();
});
</script>

<template>
  <div v-if="selectedItem" class="properties-panel">
    <div class="panel-header">
      <h3>{{ selectedItem.instanceName }} Properties</h3>
    </div>
    <div class="panel-content">
      <div class="form-group">
        <label for="instanceName">Name</label>
        <input id="instanceName" v-model="editableProperties.instanceName" @input="updateItem" />
      </div>
      <div class="form-group">
        <label for="description">Description</label>
        <textarea id="description" v-model="editableProperties.description" @input="updateItem" rows="4"></textarea>
      </div>

      <!-- UML Diagram Link for Aggregates -->
      <div v-if="selectedItem.type === 'Aggregate'" class="form-group">
        <label for="linkedDiagram">Linked UML Diagram</label>
        <select id="linkedDiagram" v-model="editableProperties.linkedDiagram" @change="updateItem">
          <option :value="undefined">None</option>
          <option v-for="board in store.umlBoards" :key="board.instanceName" :value="board.instanceName">
            {{ board.name }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.properties-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  width: 280px;
  background-color: #f8f9fa;
  border-left: 1px solid #dee2e6;
  display: flex;
  flex-direction: column;
  color: #333;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease-in-out;
}

.panel-header {
  padding: 1rem;
  border-bottom: 1px solid #dee2e6;
  background-color: #e9ecef;
}

.panel-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.panel-content {
  padding: 1rem;
  flex-grow: 1;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.5rem;
  font-size: 0.875rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background-color: #fff;
  color: #495057;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}
</style>