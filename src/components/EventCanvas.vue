<script setup lang="ts">
import { ref } from "vue";
import draggable from "vuedraggable";
import PropertiesPanel from "./PropertiesPanel.vue";
import { store } from "../store";
import type { CanvasItem } from "../types";

const toolBox = ref([
  { id: 1, type: "Command" },
  { id: 2, type: "Event" },
  { id: 3, type: "Aggregate" },
  { id: 4, type: "Policy" },
]);

const selectedItem = ref<CanvasItem | null>(null);

const cloneComponent = (item: { type: string }) => {
  return {
    id: Date.now(),
    type: item.type,
    instanceName: `New ${item.type}`,
    properties: [],
  };
};

const selectItem = (item: CanvasItem) => {
  selectedItem.value = item;
};

const handleUpdate = (updatedItem: CanvasItem) => {
  const index = store.canvasItems.findIndex(i => i.id === updatedItem.id);
  if (index !== -1) {
    store.canvasItems[index] = updatedItem;
  }
  selectedItem.value = updatedItem;
};

// When canvas items change from the store (e.g. loading a new board), deselect the current item.
store.$watch('canvasItems', () => {
  selectedItem.value = null;
});

</script>

<template>
  <div class="container">
    <div class="toolbox">
      <h3>Toolbox</h3>
      <draggable
        v-model="toolBox"
        :group="{ name: 'components', pull: 'clone', put: false }"
        :sort="false"
        :clone="cloneComponent"
        item-key="id"
      >
        <template #item="{ element }">
          <div class="tool-item">{{ element.type }}</div>
        </template>
      </draggable>
    </div>
    <div class="canvas">
      <h3>Canvas</h3>
      <draggable
        v-model="store.canvasItems"
        group="components"
        item-key="id"
        class="canvas-drag-area"
      >
        <template #item="{ element }">
          <div 
            class="canvas-item" 
            @click="selectItem(element)"
            :class="{ selected: selectedItem && selectedItem.id === element.id }"
          >
            <div class="item-header">{{ element.type }}</div>
            <div class="item-body">
              <strong>{{ element.instanceName }}</strong>
              <ul>
                <li v-for="prop in element.properties" :key="prop.key">
                  {{ prop.key }}: {{ prop.value }}
                </li>
              </ul>
            </div>
          </div>
        </template>
      </draggable>
    </div>
    <PropertiesPanel 
      v-if="selectedItem"
      :modelValue="selectedItem"
      @update:modelValue="handleUpdate"
    />
  </div>
</template>

<style scoped>
.container {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: row;
}
.toolbox {
  width: 200px;
  padding: 15px;
  border-right: 1px solid #ccc;
  background-color: #f7f7f7;
  flex-shrink: 0;
}
.tool-item {
  padding: 10px;
  margin-bottom: 10px;
  background-color: #fff;
  border: 1px solid #ddd;
  cursor: grab;
  text-align: center;
}
.canvas {
  flex-grow: 1;
  padding: 15px;
  overflow: auto;
  height: 100%;
}
.canvas-drag-area {
  height: 100%;
  border: 2px dashed #ccc;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
}
.canvas-item {
  border: 2px solid #6e7f80;
  width: 200px;
  min-height: 100px;
  margin: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  background-color: white;
}
.canvas-item.selected {
  border-color: #007bff;
  border-width: 3px;
}
.item-header {
  background-color: #6e7f80;
  color: white;
  padding: 5px;
  text-align: center;
}
.item-body {
  padding: 10px;
  flex-grow: 1;
}
.item-body ul {
  padding-left: 20px;
  font-size: 0.8em;
  margin-top: 5px;
  word-break: break-all;
}

/* Mobile Responsive Styles */
@media (max-width: 768px) {
  .container {
    flex-direction: column;
  }
  .toolbox {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #ccc;
    height: auto;
  }
  .tool-item {
    width: 40%;
  }
  .properties-panel {
    width: 100%;
    border-left: none;
    border-top: 1px solid #ccc;
  }
  .canvas-drag-area {
    min-height: 50vh;
  }
}
</style>
