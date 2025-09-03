<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Konva from 'konva';
import { store } from "../store";
import type { CanvasItem, Connection } from "../types";
import PropertiesPanel from "./PropertiesPanel.vue";
import UmlItem from "./canvas-items/UmlItem.vue";
import { useCanvasLogic } from '../composables/useCanvasLogic';

const {
  selectedItems,
  stageRef,
  transformerRef,
  selectionRectRef,
  selection,
  stageConfig,
  startConnection,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleItemClick,
  handleTransformEnd,
  handleItemDragStart,
  handleItemDragMove,
  handleItemDragEnd,
} = useCanvasLogic();

const umlToolBox = ref([
  { id: 1, type: "Class" },
  { id: 2, type: "Interface" },
  { id: 3, type: "Component" },
  { id: 4, type: "Package" },
]);

const connectionTools = ref([
    { type: 'Association' },
    { type: 'Aggregation' },
    { type: 'Composition' },
    { type: 'Generalization' },
]);

const connectionPoints = computed(() => {
  return store.connections.map(conn => {
    const fromItem = store.canvasItems.find(i => i.id === conn.from);
    const toItem = store.canvasItems.find(i => i.id === conn.to);
    if (!fromItem || !toItem) return null;

    const fromX = fromItem.x + fromItem.width / 2;
    const fromY = fromItem.y + fromItem.height / 2;
    const toX = toItem.x + toItem.width / 2;
    const toY = toItem.y + toItem.height / 2;

    return {
      id: conn.id,
      points: [fromX, fromY, toX, toY]
    };
  }).filter(p => p !== null);
});

let draggedTool = ref<{id: number, type: string} | null>(null);
const handleToolDragStart = (tool: {id: number, type: string}) => { draggedTool.value = tool; };

const calculateUmlItemHeight = (item: CanvasItem) => {
  const nameHeight = 30;
  const stereotypeHeight = item.type === 'Interface' ? 20 : 0;
  const attrHeight = (item.attributes?.length || 0) * 15;
  const methodHeight = (item.methods?.length || 0) * 15;
  const padding = 40;
  return stereotypeHeight + nameHeight + attrHeight + methodHeight + padding;
};

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
    attributes: [],
    methods: [],
    x: pos.x,
    y: pos.y,
    width: 200,
    height: 100,
    rotation: 0,
    parent: null,
  };
  if (['Class', 'Interface', 'Component', 'Package'].includes(newItem.type)) {
    newItem.height = calculateUmlItemHeight(newItem);
  }

  // Adjust position to center the item on the cursor
  newItem.x = pos.x - (newItem.width / 2);
  newItem.y = pos.y - (newItem.height / 2);

  store.canvasItems.push(newItem);
  draggedTool.value = null;
  store.pushState();
};

const handleUpdate = (updatedItem: CanvasItem) => {
  const index = store.canvasItems.findIndex((i: CanvasItem) => i.id === updatedItem.id);
  if (index !== -1) {
    if (['Class', 'Interface', 'Component', 'Package'].includes(updatedItem.type)) {
      updatedItem.height = calculateUmlItemHeight(updatedItem);
    }
    store.canvasItems[index] = updatedItem;
    const selectionIndex = selectedItems.value.findIndex(i => i.id === updatedItem.id);
    if (selectionIndex !== -1) {
        selectedItems.value[selectionIndex] = updatedItem;
    }
    store.pushState();
  }
};

watch(() => store.canvasItems, (newItems) => {
  newItems.forEach(item => {
    if (['Class', 'Interface', 'Component', 'Package'].includes(item.type)) {
      item.height = calculateUmlItemHeight(item);
    }
  });
}, { deep: true, immediate: true });

</script>

<template>
  <div class="container">
    <div class="toolbox">
      <h3>UML Toolbox</h3>
      <div v-for="tool in umlToolBox" :key="tool.id" class="tool-item" draggable="true" @dragstart="handleToolDragStart(tool)">
        {{ tool.type }}
      </div>
      <hr />
      <h4>Connections</h4>
      <div v-for="tool in connectionTools" :key="tool.type" class="tool-item" @click="startConnection(tool.type)">
        {{ tool.type }}
      </div>
      <hr />
      <button @click="store.showEventCanvas()">Back to Event Canvas</button>
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
          <UmlItem 
            v-for="item in store.canvasItems" 
            :key="item.id" 
            :item="item"
            @click="handleItemClick($event, item)" 
            @dragstart="handleItemDragStart($event, item)"
            @dragmove="handleItemDragMove"
            @dragend="handleItemDragEnd($event)"
            @transformend="handleTransformEnd"
          />

          <v-arrow 
            v-for="conn in connectionPoints" 
            :key="conn.id" 
            :config="{ 
              points: conn.points, 
              stroke: 'black', 
              fill: 'black', 
              strokeWidth: 2 
            }" 
          />

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
</style>
