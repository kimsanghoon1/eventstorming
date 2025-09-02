<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import Konva from 'konva';
import { store } from "../store";
import type { CanvasItem, Connection } from "../types";
import PropertiesPanel from "./PropertiesPanel.vue";
import ObjectProperties from "./ObjectProperties.vue";

// --- Configuration ---
const colorMap: Record<string, string> = {
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

const selectedItems = ref<CanvasItem[]>([]);
const stageRef = ref<{ getStage: () => Konva.Stage } | null>(null);
const transformerRef = ref<{ getNode: () => Konva.Transformer } | null>(null);
const selectionRectRef = ref<{ getNode: () => Konva.Rect } | null>(null);
const selection = ref({
  visible: false,
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 0,
});

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
  if (e.key === 'Escape') {
    if (connectingMode.value) {
      connectingMode.value = false;
      sourceNodeId.value = null;
    }
    selectedItems.value = [];
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

const handleContextDragStart = (e: Konva.KonvaEventObject<DragEvent>, item: CanvasItem) => {
  // Your existing logic for context drag start
};

const handleContextDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
  // Your existing logic for context drag move
};

// --- Item Categories ---
const categorizedItems = computed(() => {
  const result = {
    contextBoxes: [] as CanvasItem[],
    actors: [] as CanvasItem[],
    aggregates: [] as CanvasItem[],
    stickyNotes: [] as CanvasItem[],
  };
  for (const item of store.canvasItems) {
    switch (item.type) {
      case 'ContextBox':
        result.contextBoxes.push(item);
        break;
      case 'Actor':
        result.actors.push(item);
        break;
      case 'Aggregate':
        result.aggregates.push(item);
        break;
      default:
        result.stickyNotes.push(item);
        break;
    }
  }
  return result;
});

const calculateItemHeight = (item: CanvasItem) => {
  const baseHeight = 100;
  const propertyHeight = item.properties ? item.properties.length * 15 : 0;
  return baseHeight + propertyHeight;
};

// --- Parenting Logic ---
const findParentContext = (item: CanvasItem): number | null => {
  const itemCenter = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
  const parents = categorizedItems.value.contextBoxes
    .filter(ctx => 
      itemCenter.x >= ctx.x && 
      itemCenter.x <= ctx.x + ctx.width && 
      itemCenter.y >= ctx.y && 
      itemCenter.y <= ctx.y + ctx.height
    );
  return parents.length > 0 ? parents[parents.length - 1].id : null;
};

// --- Drag and Drop from Toolbox ---
let draggedTool = ref<{id: number, type: string} | null>(null);
const handleToolDragStart = (tool: {id: number, type: string}) => { draggedTool.value = tool; };

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  if (!draggedTool.value || !stageRef.value) return;

  const stage = stageRef.value.getStage();
  stage.setPointersPositions(e);
  const pos = stage.getPointerPosition();
  if (!pos) return;

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
const handleItemDragEnd = (e: Konva.KonvaEventObject<DragEvent>, item: CanvasItem) => {
    const movedItem = store.canvasItems.find(i => i.id === item.id);
    if (movedItem) {
        movedItem.x = e.target.x();
        movedItem.y = e.target.y();
        movedItem.parent = findParentContext(movedItem);
    }
};

const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    if (!transformerRef.value) return;
    const transformer = transformerRef.value.getNode();
    const nodes = (e.target as any) === transformer ? transformer.nodes() : [e.target];
    
    nodes.forEach((node: Konva.Node) => {
        const id = Number(node.name().split('-')[1]);
        const item = store.canvasItems.find((i: CanvasItem) => i.id === id);
        if (item) {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();

            node.scaleX(1);
            node.scaleY(1);

            item.x = node.x();
            item.y = node.y();
            item.rotation = node.rotation();
            item.width = Math.max(5, item.width * scaleX);
            item.height = Math.max(5, item.height * scaleY);
        }
    });
};

const isSelected = (item: CanvasItem) => selectedItems.value.some(i => i.id === item.id);

const handleItemClick = (e: Konva.KonvaEventObject<MouseEvent>, item: CanvasItem) => {
  if (connectingMode.value) {
    handleConnectionClick(item);
    return;
  }
  
  const isCtrlPressed = e.evt.ctrlKey || e.evt.metaKey;
  const isItemAlreadySelected = isSelected(item);

  if (!isCtrlPressed) {
    if (isItemAlreadySelected && selectedItems.value.length === 1) {
      return;
    } 
    selectedItems.value = [item];
  } else {
    if (isItemAlreadySelected) {
      selectedItems.value = selectedItems.value.filter(i => i.id !== item.id);
    } else {
      selectedItems.value.push(item);
    }
  }
};

const handleUpdate = (updatedItem: CanvasItem) => {
  const index = store.canvasItems.findIndex((i: CanvasItem) => i.id === updatedItem.id);
  if (index !== -1) {
    const oldItem = store.canvasItems[index];
    const newItem = { ...updatedItem };
    if (JSON.stringify(oldItem.properties) !== JSON.stringify(newItem.properties)) {
      newItem.height = calculateItemHeight(newItem);
    }
    store.canvasItems[index] = newItem;
    
    const selectionIndex = selectedItems.value.findIndex(i => i.id === updatedItem.id);
    if (selectionIndex !== -1) {
        selectedItems.value[selectionIndex] = newItem;
    }
  }
};

// --- Transformer Logic ---
const updateTransformer = () => {
  if (!transformerRef.value || !stageRef.value) return;
  const transformerNode = transformerRef.value.getNode();
  const stage = stageRef.value.getStage();
  
  const selectedNodes = selectedItems.value.map(item => {
    return stage.findOne('.item-' + item.id);
  }).filter((n): n is Konva.Node => !!n);

  transformerNode.nodes(selectedNodes);
  const layer = transformerNode.getLayer();
  if (layer) {
    layer.batchDraw();
  }
};

watch(selectedItems, updateTransformer);
watch(() => store.activeBoard, () => { selectedItems.value = []; });

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
      if (!store.connections.find((c: Connection) => c.id === newConnection.id)) { 
        store.connections.push(newConnection); 
      }
    }
    sourceNodeId.value = null;
  }
};
const getEdgePoint = (source: CanvasItem, target: CanvasItem) => {
    const dx = (target.x + target.width / 2) - (source.x + source.width / 2);
    const dy = (target.y + target.height / 2) - (source.y + source.height / 2);
    const angle = Math.atan2(dy, dx);
    const a = source.width / 2; const b = source.height / 2;
    const r = a * b / Math.sqrt(b*b * Math.pow(Math.cos(angle), 2) + a*a * Math.pow(Math.sin(angle), 2));
    return { x: source.x + a + r * Math.cos(angle), y: source.y + b + r * Math.sin(angle) };
}
const connectionPoints = computed(() => {
  return store.connections.map((conn: Connection) => {
    const fromNode = store.canvasItems.find((item: CanvasItem) => item.id === conn.from);
    const toNode = store.canvasItems.find((item: CanvasItem) => item.id === conn.to);
    if (!fromNode || !toNode) return null;
    const fromPoint = getEdgePoint(fromNode, toNode);
    const toPoint = getEdgePoint(toNode, fromNode);
    return [fromPoint.x, fromPoint.y, toPoint.x, toPoint.y];
  }).filter((p): p is [number, number, number, number] => p !== null);
});

// --- Selection Box Logic ---
const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
  if (e.target !== e.target.getStage()) {
    return;
  }
  e.evt.preventDefault();
  selectedItems.value = [];
  const stage = e.target.getStage();
  if (!stage) return;
  const pos = stage.getPointerPosition();
  if (!pos) return;
  selection.value = {
    visible: true,
    x1: pos.x,
    y1: pos.y,
    x2: pos.x,
    y2: pos.y,
  };
};

const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
  if (!selection.value.visible) {
    return;
  }
  e.evt.preventDefault();
  const stage = e.target.getStage();
  if (!stage) return;
  const pos = stage.getPointerPosition();
  if (!pos) return;
  selection.value.x2 = pos.x;
  selection.value.y2 = pos.y;
};

const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
  if (!selection.value.visible) {
    return;
  }
  e.evt.preventDefault();
  
  setTimeout(() => {
    selection.value.visible = false;
  }, 0);

  if (!stageRef.value || !selectionRectRef.value) return;
  const stage = stageRef.value.getStage();
  const box = selectionRectRef.value.getNode().getClientRect();
  const newlySelected: CanvasItem[] = [];
  store.canvasItems.forEach((item: CanvasItem) => {
    const node = stage.findOne('.item-' + item.id);
    if (node) {
        const nodeBox = node.getClientRect();
        if (Konva.Util.haveIntersection(box, nodeBox)) {
            newlySelected.push(item);
        }
    }
  });
  selectedItems.value = newlySelected;
};
</script>

<template>
  <div class="container">
    <div class="toolbox">
      <h3>Toolbox</h3>
      <div v-for="tool in toolBox" :key="tool.id" class="tool-item" :style="{ backgroundColor: colorMap[tool.type] }" draggable="true" @dragstart="handleToolDragStart(tool)">
        {{ tool.type }}
      </div>
      <hr />
      <button @click="toggleConnectingMode" class="connect-btn" :class="{ active: connectingMode }">
        {{ connectingMode ? 'Connecting...' : 'Add Connection (c)' }}
      </button>
    </div>

    <div class="canvas-wrapper" @drop="handleDrop" @dragover.prevent>
      <v-stage 
        ref="stageRef" 
        :config="stageConfig" 
        @mousedown="handleMouseDown" 
        @mousemove="handleMouseMove" 
        @mouseup="handleMouseUp"
      >
        <v-layer>
          <!-- Bounded Contexts -->
          <v-group v-for="item in categorizedItems.contextBoxes" :key="item.id" :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0, dragDistance: 10 }" @dragstart="handleContextDragStart($event, item)" @dragmove="handleContextDragMove" @dragend="handleItemDragEnd($event, item)" @click="handleItemClick($event, item)" @transformend="handleTransformEnd">
            <v-rect :config="{
              width: item.width,
              height: item.height,
              fill: colorMap[item.type],
              stroke: isSelected(item) ? '#007bff' : '#adb5bd',
              strokeWidth: 2,
              dash: [10, 5]
            }" />
            <v-text :config="{ text: item.instanceName, fontSize: 18, fontStyle: 'bold', padding: 10 }" />
          </v-group>

          <!-- Aggregates -->
          <v-group v-for="item in categorizedItems.aggregates" :key="item.id" :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0, dragDistance: 10 }" @dragend="handleItemDragEnd($event, item)" @click="handleItemClick($event, item)" @transformend="handleTransformEnd">
            <v-rect :config="{
              width: item.width,
              height: item.height,
              fill: colorMap[item.type],
              stroke: isSelected(item) || item.id === sourceNodeId ? '#007bff' : 'black',
              strokeWidth: 2,
              cornerRadius: 5
            }" />
            <v-text :config="{ text: item.type, fontSize: 14, fontStyle: 'bold', width: item.width, padding: 10, align: 'center' }" />
            <v-text :config="{ text: item.instanceName, fontSize: 16, width: item.width, padding: 30, align: 'center' }" />
            <ObjectProperties :properties="item.properties" :itemWidth="item.width" />
          </v-group>

          <!-- Connections -->
          <v-arrow v-for="(points, index) in connectionPoints" :key="`conn-${index}`" :config="{ points: points, stroke: 'black', fill: 'black', pointerLength: 10, pointerWidth: 10 }" />

          <!-- Actors -->
          <v-group v-for="item in categorizedItems.actors" :key="item.id" :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0, dragDistance: 10 }" @dragend="handleItemDragEnd($event, item)" @click="handleItemClick($event, item)" @transformend="handleTransformEnd">
            <v-rect :config="{
              width: item.width,
              height: item.height,
              fill: item.parent ? 'transparent' : colorMap[item.type],
              stroke: isSelected(item) || item.id === sourceNodeId ? '#007bff' : 'black',
              strokeWidth: 2,
              cornerRadius: 5
            }" />
            <v-group :config="{ x: item.width / 2, y: item.height / 2, scaleX: 0.4, scaleY: 0.4 }">
              <v-circle :config="{ x: 0, y: -25, radius: 20, stroke: 'black', strokeWidth: 4 }"/>
              <v-path :config="{ x: 0, y: 0, data: 'M -30 0 L 30 0 M 0 -5 L 0 40 M -30 0 L 0 40 L 30 0', stroke: 'black', strokeWidth: 4 }"/>
            </v-group>
            <v-text :config="{ text: item.instanceName, fontSize: 16, width: item.width, y: item.height - 30, align: 'center' }" />
            <ObjectProperties :properties="item.properties" :itemWidth="item.width" />
          </v-group>

          <!-- Sticky Notes -->
          <v-group v-for="item in categorizedItems.stickyNotes" :key="item.id" :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0, dragDistance: 10 }" @dragend="handleItemDragEnd($event, item)" @click="handleItemClick($event, item)" @transformend="handleTransformEnd">
            <v-rect :config="{
              width: item.width,
              height: item.height,
              fill: colorMap[item.type],
              stroke: isSelected(item) || item.id === sourceNodeId ? '#007bff' : 'black',
              strokeWidth: 2,
              cornerRadius: 5
            }" />
            <v-text :config="{ text: item.type, fontSize: 14, fontStyle: 'bold', width: item.width, padding: 10, align: 'center' }" />
            <v-text :config="{ text: item.instanceName, fontSize: 16, width: item.width, padding: 30, align: 'center' }" />
            <ObjectProperties :properties="item.properties" :itemWidth="item.width" />
          </v-group>

          <v-transformer 
            ref="transformerRef" 
            :config="{
              boundBoxFunc: (oldBox: { x: number; y: number; width: number; height: number; }, newBox: { x: number; y: number; width: number; height: number; }) => {
                if (newBox.width < 5 || newBox.height < 5) {
                  return oldBox;
                }
                return newBox;
              },
            }" 
            @transformend="handleTransformEnd"
          />

          <v-rect 
            ref="selectionRectRef" 
            :config="{
              x: Math.min(selection.x1, selection.x2),
              y: Math.min(selection.y1, selection.y2),
              width: Math.abs(selection.x1 - selection.x2),
              height: Math.abs(selection.y1 - selection.y2),
              fill: 'rgba(0, 161, 255, 0.3)',
              visible: selection.visible,
            }" 
          />
        </v-layer>
      </v-stage>
    </div>

    <PropertiesPanel v-if="selectedItems.length > 0" :modelValue="selectedItems[selectedItems.length - 1]" @update:modelValue="handleUpdate" />
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
