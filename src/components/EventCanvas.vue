'''<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { store } from "../store";
import type { CanvasItem, Connection } from "../types";
import PropertiesPanel from "./PropertiesPanel.vue";

// --- Configuration ---
const colorMap = {
  Command: '#90e0ef',   // Light Blue
  Event: '#ffb703',     // Orange
  Aggregate: '#fddd81', // Yellow
  Policy: '#f4a261',    // Sandy Brown
  ContextBox: '#e9ecef' // Light Gray
};

const toolBox = ref([
  { id: 1, type: "Command" },
  { id: 2, type: "Event" },
  { id: 3, type: "Aggregate" },
  { id: 4, type: "Policy" },
  { id: 5, type: "ContextBox" },
]);

const selectedItem = ref<CanvasItem | null>(null);
const stageRef = ref(null);

const stageConfig = {
  width: window.innerWidth - 450,
  height: window.innerHeight - 100,
};

// --- Item Categories ---
const contextBoxes = computed(() => store.canvasItems.filter(item => item.type === 'ContextBox'));
const stickyNotes = computed(() => store.canvasItems.filter(item => item.type !== 'ContextBox'));

// --- Drag and Drop from Toolbox ---
let draggedTool = ref(null);
const handleDragStart = (tool) => { draggedTool.value = tool; };

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
    width: draggedTool.value.type === 'ContextBox' ? 400 : 200,
    height: draggedTool.value.type === 'ContextBox' ? 300 : 100,
  };
  store.canvasItems.push(newItem);
  draggedTool.value = null;
};

// --- Canvas Item Interactions ---
const handleItemDragEnd = (e, item) => {
  const index = store.canvasItems.findIndex(i => i.id === item.id);
  if (index !== -1) {
    store.canvasItems[index].x = e.target.x();
    store.canvasItems[index].y = e.target.y();
  }
};

const handleItemClick = (e, item) => {
  if (connectingMode.value) {
    handleConnectionClick(item);
  } else {
    selectedItem.value = item;
  }
};

const handleStageClick = (e) => {
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

watch(() => store.activeBoard, () => { selectedItem.value = null; });

// --- Connection Logic ---
const connectingMode = ref(false);
const sourceNodeId = ref<number | null>(null);

const toggleConnectingMode = () => {
  connectingMode.value = !connectingMode.value;
  sourceNodeId.value = null;
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
      if (!store.connections.find(c => c.id === newConnection.id)) {
        store.connections.push(newConnection);
      }
    }
    sourceNodeId.value = null;
    connectingMode.value = false;
  }
};

const getEdgePoint = (source, target) => {
    const dx = (target.x + target.width / 2) - (source.x + source.width / 2);
    const dy = (target.y + target.height / 2) - (source.y + source.height / 2);
    const angle = Math.atan2(dy, dx);

    const a = source.width / 2;
    const b = source.height / 2;

    const r = a * b / Math.sqrt(b*b * Math.pow(Math.cos(angle), 2) + a*a * Math.pow(Math.sin(angle), 2));

    return {
        x: source.x + a + r * Math.cos(angle),
        y: source.y + b + r * Math.sin(angle)
    };
}

const connectionPoints = computed(() => {
  return store.connections.map(conn => {
    const fromNode = store.canvasItems.find(item => item.id === conn.from);
    const toNode = store.canvasItems.find(item => item.id === conn.to);
    if (!fromNode || !toNode) return null;

    const fromPoint = getEdgePoint(fromNode, toNode);
    const toPoint = getEdgePoint(toNode, fromNode);

    return [fromPoint.x, fromPoint.y, toPoint.x, toPoint.y];
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
        :style="{ backgroundColor: colorMap[tool.type] }"
        draggable="true"
        @dragstart="handleDragStart(tool)"
      >
        {{ tool.type }}
      </div>
      <hr>
      <button @click="toggleConnectingMode" class="connect-btn" :class="{ active: connectingMode }">
        {{ connectingMode ? 'Connecting...' : 'Add Connection' }}
      </button>
    </div>

    <div class="canvas-wrapper" @drop="handleDrop" @dragover.prevent>
      <v-stage ref="stageRef" :config="stageConfig" @click="handleStageClick">
        <v-layer>
          <!-- Bounded Contexts (drawn first, in the back) -->
          <v-group v-for="item in contextBoxes" :key="item.id" :config="{ x: item.x, y: item.y, draggable: true }" @dragend="handleItemDragEnd($event, item)" @click="handleItemClick($event, item)">
            <v-rect :config="{
              width: item.width,
              height: item.height,
              fill: colorMap[item.type],
              stroke: '#adb5bd',
              strokeWidth: 2,
              dash: [10, 5]
            }" />
            <v-text :config="{ text: item.instanceName, fontSize: 18, fontStyle: 'bold', padding: 10 }" />
          </v-group>

          <!-- Connections -->
          <v-arrow v-for="(points, index) in connectionPoints" :key="`conn-${index}`" :config="{ points: points, stroke: 'black', fill: 'black', pointerLength: 10, pointerWidth: 10 }" />

          <!-- Sticky Notes -->
          <v-group v-for="item in stickyNotes" :key="item.id" :config="{ x: item.x, y: item.y, draggable: true }" @dragend="handleItemDragEnd($event, item)" @click="handleItemClick($event, item)">
            <v-rect :config="{
              width: item.width,
              height: item.height,
              fill: colorMap[item.type],
              stroke: item.id === (selectedItem && selectedItem.id) || item.id === sourceNodeId ? '#007bff' : 'black',
              strokeWidth: item.id === (selectedItem && selectedItem.id) || item.id === sourceNodeId ? 4 : 2,
              cornerRadius: 5,
              shadowBlur: 5,
              shadowOpacity: 0.5
            }" />
            <v-text :config="{ text: item.type, fontSize: 14, fontStyle: 'bold', width: item.width, padding: 10, align: 'center' }" />
            <v-text :config="{ text: item.instanceName, fontSize: 16, width: item.width, padding: 30, align: 'center' }" />
          </v-group>
        </v-layer>
      </v-stage>
    </div>

    <PropertiesPanel v-if="selectedItem" :modelValue="selectedItem" @update:modelValue="handleUpdate" />
  </div>
</template>

<style scoped>
.container { display: flex; width: 100%; height: 100%; flex-direction: row; }
.toolbox { width: 200px; padding: 15px; border-right: 1px solid #ccc; background-color: #f7f7f7; flex-shrink: 0; }
.tool-item { padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; cursor: grab; text-align: center; font-weight: bold; }
.canvas-wrapper { flex-grow: 1; overflow: hidden; }
.connect-btn { width: 100%; padding: 10px; background-color: #ffc107; border: none; cursor: pointer; }
.connect-btn.active { background-color: #e0a800; font-weight: bold; }
</style>
'''