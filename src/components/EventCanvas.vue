<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { store } from "../store";
import type { CanvasItem, Connection } from "../types";
import PropertiesPanel from "./PropertiesPanel.vue";
import ObjectProperties from "./ObjectProperties.vue";

// --- Configuration ---
const colorMap = {
  Command: '#90e0ef',   // Light Blue
  Event: '#ffb703',     // Orange
  Aggregate: '#fddd81', // Yellow
  Policy: '#f4a261',    // Sandy Brown
  ContextBox: '#e9ecef', // Light Gray
  Actor: '#d0f4de',      // Light Green
  ReadModel: '#a9d6e5'  // Light Steel Blue
};

const toolBox = ref([
  { id: 1, type: "Command" },
  { id: 2, type: "Event" },
  { id: 3, type: "Aggregate" },
  { id: 4, type: "Policy" },
  { id: 5, type: "ContextBox" },
  { id: 6, type: "Actor" },
  { id: 7, type: "ReadModel" },
]);

const selectedItem = ref<CanvasItem | null>(null);
const stageRef = ref(null);
const transformerRef = ref(null);

const stageConfig = ref({ width: 100, height: 100 });

const handleResize = () => {
  const wrapper = document.querySelector('.canvas-wrapper');
  if (wrapper) {
    stageConfig.value = {
      width: wrapper.clientWidth,
      height: wrapper.clientHeight,
    };
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && connectingMode.value) {
    connectingMode.value = false;
    sourceNodeId.value = null;
  }
  if (e.key === 'c') {
    toggleConnectingMode();
  }
};

onMounted(() => {
  handleResize();
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleKeyDown);
});


// --- Item Categories ---
const contextBoxes = computed(() => store.canvasItems.filter(item => item.type === 'ContextBox'));
const actors = computed(() => store.canvasItems.filter(item => item.type === 'Actor'));
const stickyNotes = computed(() => store.canvasItems.filter(item => !['ContextBox', 'Actor'].includes(item.type)));

const calculateItemHeight = (item: CanvasItem) => {
  const baseHeight = 100;
  const propertyHeight = item.properties ? item.properties.length * 15 : 0;
  return baseHeight + propertyHeight;
};

// --- Parenting Logic ---
const findParentContext = (item: CanvasItem): number | null => {
  const itemCenter = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
  const parents = contextBoxes.value
    .filter(ctx => 
      itemCenter.x >= ctx.x && 
      itemCenter.x <= ctx.x + ctx.width && 
      itemCenter.y >= ctx.y && 
      itemCenter.y <= ctx.y + ctx.height
    );
  return parents.length > 0 ? parents[parents.length - 1].id : null;
};

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
    height: 100,
    rotation: 0,
    parent: null,
  };
  newItem.height = calculateItemHeight(newItem);
  newItem.parent = findParentContext(newItem);
  store.canvasItems.push(newItem);
  draggedTool.value = null;
};

// --- Canvas Item Interactions ---
const handleItemDragEnd = (e, item) => {
  const movedItemIndex = store.canvasItems.findIndex(i => i.id === item.id);
  if (movedItemIndex === -1) return;

  const oldPos = { x: store.canvasItems[movedItemIndex].x, y: store.canvasItems[movedItemIndex].y };
  const newPos = { x: e.target.x(), y: e.target.y() };
  
  store.canvasItems[movedItemIndex].x = newPos.x;
  store.canvasItems[movedItemIndex].y = newPos.y;

  if (item.type === 'ContextBox') {
    const dx = newPos.x - oldPos.x;
    const dy = newPos.y - oldPos.y;
    store.canvasItems.forEach((child, index) => {
      if (child.parent === item.id) {
        const newChild = { ...child, x: child.x + dx, y: child.y + dy };
        store.canvasItems[index] = newChild;
      }
    });
  } else {
    store.canvasItems[movedItemIndex].parent = findParentContext(store.canvasItems[movedItemIndex]);
  }
};

const handleTransformEnd = (e, item) => {
    const node = e.target;
    const index = store.canvasItems.findIndex(i => i.id === item.id);
    if (index !== -1) {
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);

        store.canvasItems[index] = {
            ...store.canvasItems[index],
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
        };
    }
};

const handleItemClick = (e, item) => {
  if (connectingMode.value) {
    handleConnectionClick(item);
  } else {
    selectedItem.value = item;
    updateTransformer();
  }
};

const handleStageClick = (e) => {
  if (e.target === e.target.getStage()) {
    selectedItem.value = null;
    updateTransformer();
  }
};

const handleUpdate = (updatedItem: CanvasItem) => {
  const index = store.canvasItems.findIndex(i => i.id === updatedItem.id);
  if (index !== -1) {
    const oldItem = store.canvasItems[index];
    const newItem = { ...updatedItem };
    if (JSON.stringify(oldItem.properties) !== JSON.stringify(newItem.properties)) {
      newItem.height = calculateItemHeight(newItem);
    }
    store.canvasItems[index] = newItem;
    selectedItem.value = newItem;
  }
};

// --- Transformer Logic ---
const updateTransformer = () => {
  const transformerNode = transformerRef.value.getNode();
  const stage = stageRef.value.getStage();
  const selected = selectedItem.value;

  if (selected && selected.id) {
    const selectedNode = stage.findOne('.item-' + selected.id);
    if (selectedNode) {
      transformerNode.nodes([selectedNode]);
    } else {
      transformerNode.nodes([]);
    }
  } else {
    transformerNode.nodes([]);
  }
  if (transformerNode.getLayer()) {
    transformerNode.getLayer().batchDraw();
  }
};

watch(selectedItem, updateTransformer);
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
  }
  else {
    if (sourceNodeId.value !== targetItem.id) {
      const newConnection: Connection = { 
        id: `conn-${sourceNodeId.value}-${targetItem.id}`,
        from: sourceNodeId.value, 
        to: targetItem.id 
      };
      if (!store.connections.find(c => c.id === newConnection.id)) { 
        store.connections.push(newConnection); 
      }
    }
    sourceNodeId.value = null; // Reset for next connection, but stay in connecting mode
  }
};
const getEdgePoint = (source, target) => {
    const dx = (target.x + target.width / 2) - (source.x + source.width / 2);
    const dy = (target.y + target.height / 2) - (source.y + source.height / 2);
    const angle = Math.atan2(dy, dx);
    const a = source.width / 2; const b = source.height / 2;
    const r = a * b / Math.sqrt(b*b * Math.pow(Math.cos(angle), 2) + a*a * Math.pow(Math.sin(angle), 2));
    return { x: source.x + a + r * Math.cos(angle), y: source.y + b + r * Math.sin(angle) };
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
      <div v-for="tool in toolBox" :key="tool.id" class="tool-item" :style="{ backgroundColor: colorMap[tool.type] }" draggable="true" @dragstart="handleDragStart(tool)">
        {{ tool.type }}
      </div>
      <hr>
      <button @click="toggleConnectingMode" class="connect-btn" :class="{ active: connectingMode }">
        {{ connectingMode ? 'Connecting...' : 'Add Connection (c)' }}
      </button>
    </div>

    <div class="canvas-wrapper" @drop="handleDrop" @dragover.prevent>
      <v-stage ref="stageRef" :config="stageConfig" @click="handleStageClick">
        <v-layer>
          <!-- Bounded Contexts -->
          <v-group v-for="item in contextBoxes" :key="item.id" :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0 }" @dragend="handleItemDragEnd($event, item)" @click="handleItemClick($event, item)" @transformend="handleTransformEnd($event, item)">
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

          <!-- Actors -->
          <v-group v-for="item in actors" :key="item.id" :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0 }" @dragend="handleItemDragEnd($event, item)" @click="handleItemClick($event, item)" @transformend="handleTransformEnd($event, item)">
            <v-rect :config="{
              width: item.width,
              height: item.height,
              fill: item.parent ? 'transparent' : colorMap[item.type],
              stroke: item.id === sourceNodeId ? '#007bff' : 'black',
              strokeWidth: 2,
              cornerRadius: 5,
              shadowBlur: 5,
              shadowOpacity: 0.5
            }" />
            <v-group :config="{ x: item.width / 2, y: item.height / 2, scaleX: 0.4, scaleY: 0.4 }">
              <v-circle :config="{ x: 0, y: -25, radius: 20, stroke: 'black', strokeWidth: 4 }"/>
              <v-path :config="{ x: 0, y: 0, data: 'M -30 0 L 30 0 M 0 -5 L 0 40 M -30 0 L 0 40 L 30 0', stroke: 'black', strokeWidth: 4 }"/>
            </v-group>
            <v-text :config="{ text: item.instanceName, fontSize: 16, width: item.width, y: item.height - 30, align: 'center' }" />
            <ObjectProperties :properties="item.properties" :itemWidth="item.width" />
          </v-group>

          <!-- Sticky Notes -->
          <v-group v-for="item in stickyNotes" :key="item.id" :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0 }" @dragend="handleItemDragEnd($event, item)" @click="handleItemClick($event, item)" @transformend="handleTransformEnd($event, item)">
            <v-rect :config="{
              width: item.width,
              height: item.height,
              fill: colorMap[item.type],
              stroke: item.id === sourceNodeId ? '#007bff' : 'black',
              strokeWidth: 2,
              cornerRadius: 5,
              shadowBlur: 5,
              shadowOpacity: 0.5
            }" />
            <v-text :config="{ text: item.type, fontSize: 14, fontStyle: 'bold', width: item.width, padding: 10, align: 'center' }" />
            <v-text :config="{ text: item.instanceName, fontSize: 16, width: item.width, padding: 30, align: 'center' }" />
            <ObjectProperties :properties="item.properties" :itemWidth="item.width" />
          </v-group>

          <v-transformer ref="transformerRef" :config="{
            boundBoxFunc: (oldBox, newBox) => {
              // limit resize
              if (newBox.width < 5 || newBox.height < 5) {
                return oldBox;
              }
              return newBox;
            },
          }" />
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