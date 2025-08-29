'''<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { store } from "../store";
import type { CanvasItem, Connection } from "../types";
import PropertiesPanel from "./PropertiesPanel.vue";

const toolBox = ref([
  { id: 1, type: "Command" },
  { id: 2, type: "Event" },
  { id: 3, type: "Aggregate" },
  { id: 4, type: "Policy" },
]);

const selectedItem = ref<CanvasItem | null>(null);
const stageRef = ref(null);

// Konva stage config
const stageConfig = {
  width: window.innerWidth - 450, // Adjust based on toolbox/panel widths
  height: window.innerHeight - 100, // Adjust based on header height
};

// --- Drag and Drop from Toolbox to Canvas ---
let draggedTool = ref(null);

const handleDragStart = (tool) => {
  draggedTool.value = tool;
};

const handleDrop = (e) => {
  e.preventDefault();
  if (!draggedTool.value) return;

  const stage = stageRef.value.getStage();
  stage.setPointersPositions(e);
  const pos = stage.getPointerPosition();

  const newItem: CanvasItem = {
    id: Date.now(),
    type: draggedTool.value.type,
    instanceName: `New ${draggedTool.value.type}`,
    properties: [],
    x: pos.x,
    y: pos.y,
  };
  store.canvasItems.push(newItem);
  draggedTool.value = null;
};

// --- Item Dragging on Canvas ---
const handleItemDragEnd = (e, item) => {
  const index = store.canvasItems.findIndex(i => i.id === item.id);
  if (index !== -1) {
    store.canvasItems[index].x = e.target.x();
    store.canvasItems[index].y = e.target.y();
  }
};

// --- Item Selection & Properties ---
const handleItemClick = (e, item) => {
  if (connectingMode.value) {
    handleConnectionClick(item);
  } else {
    selectedItem.value = item;
  }
};

const handleStageClick = (e) => {
  // Deselect if clicking on the stage background
  if (e.target === e.target.getStage()) {
    selectedItem.value = null;
  }
};

const handleUpdate = (updatedItem: CanvasItem) => {
  const index = store.canvasItems.findIndex(i => i.id === updatedItem.id);
  if (index !== -1) {
    store.canvasItems[index] = updatedItem;
  }
  selectedItem.value = updatedItem;
};

watch(() => store.canvasItems, () => {
  selectedItem.value = null;
}, { deep: true });


// --- Connection Logic ---
const connectingMode = ref(false);
const sourceNodeId = ref<number | null>(null);

const toggleConnectingMode = () => {
  connectingMode.value = !connectingMode.value;
  sourceNodeId.value = null; // Reset on toggle
};

const handleConnectionClick = (targetItem: CanvasItem) => {
  if (sourceNodeId.value === null) {
    sourceNodeId.value = targetItem.id;
  } else {
    if (sourceNodeId.value !== targetItem.id) {
      const newConnection: Connection = {
        id: `conn-${sourceNodeId.value}-${targetItem.id}`,
        from: sourceNodeId.value,
        to: targetItem.id,
      };
      // Avoid duplicate connections
      if (!store.connections.find(c => c.id === newConnection.id)) {
        store.connections.push(newConnection);
      }
    }
    // Reset after attempting to connect
    sourceNodeId.value = null;
    connectingMode.value = false;
  }
};

const connectionPoints = computed(() => {
  return store.connections.map(conn => {
    const fromNode = store.canvasItems.find(item => item.id === conn.from);
    const toNode = store.canvasItems.find(item => item.id === conn.to);
    if (!fromNode || !toNode) return null;
    
    const from = { x: fromNode.x + 100, y: fromNode.y + 50 }; // center of item
    const to = { x: toNode.x + 100, y: toNode.y + 50 }; // center of item

    return [from.x, from.y, to.x, to.y];
  }).filter(p => p !== null);
});

</script>

<template>
  <div class="container">
    <div class="toolbox">
      <h3>Toolbox</h3>
      <div 
        v-for="tool in toolBox"
        :key="tool.id"
        class="tool-item"
        draggable="true"
        @dragstart="handleDragStart(tool)"
      >
        {{ tool.type }}
      </div>
      <hr>
      <button 
        @click="toggleConnectingMode" 
        class="connect-btn"
        :class="{ active: connectingMode }"
      >
        {{ connectingMode ? 'Connecting...' : 'Add Connection' }}
      </button>
    </div>

    <div class="canvas-wrapper" @drop="handleDrop" @dragover.prevent>
      <v-stage ref="stageRef" :config="stageConfig" @click="handleStageClick">
        <v-layer>
          <!-- Connections -->
          <v-arrow v-for="(points, index) in connectionPoints" :key="index" :config="{ points: points, stroke: 'black', fill: 'black' }" />

          <!-- Canvas Items -->
          <v-group 
            v-for="item in store.canvasItems" 
            :key="item.id" 
            :config="{ x: item.x, y: item.y, draggable: true }"
            @dragend="handleItemDragEnd($event, item)"
            @click="handleItemClick($event, item)"
          >
            <v-rect :config="{
              width: 200,
              height: 100,
              fill: item.id === (selectedItem && selectedItem.id) || item.id === sourceNodeId ? '#a2d2ff' : 'white',
              stroke: 'black',
              strokeWidth: 2,
              cornerRadius: 5,
            }" />
            <v-text :config="{
              text: item.type,
              fontSize: 14,
              fontStyle: 'bold',
              fill: 'black',
              width: 200,
              padding: 10,
              align: 'center',
            }" />
            <v-text :config="{
              text: item.instanceName,
              fontSize: 16,
              fill: 'black',
              width: 200,
              padding: 30,
              align: 'center',
            }" />
          </v-group>
        </v-layer>
      </v-stage>
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
.canvas-wrapper {
  flex-grow: 1;
  overflow: hidden;
}
.connect-btn {
  width: 100%;
  padding: 10px;
  background-color: #ffc107;
  border: none;
  cursor: pointer;
}
.connect-btn.active {
  background-color: #e0a800;
  font-weight: bold;
}
</style>
''
