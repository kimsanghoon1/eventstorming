<script setup lang="ts">
import { ref, computed } from "vue";
import { store } from "../store";
import type { CanvasItem } from "../types";
import PropertiesPanel from "./PropertiesPanel.vue";
import { useCanvasLogic } from '../composables/useCanvasLogic';
import EventItem from './canvas-items/EventItem.vue';

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

const canvasItemsJSON = computed(() => {
  const items = store.canvasItems?.toJSON() ?? [];
  return items.sort((a, b) => {
    if (a.type === 'ContextBox' && b.type !== 'ContextBox') {
      return -1;
    }
    if (a.type !== 'ContextBox' && b.type === 'ContextBox') {
      return 1;
    }
    return 0;
  });
});
const connectionsJSON = computed(() => store.connections?.toJSON() ?? []);

const toolBox = ref([
  { id: 1, type: "Command" },
  { id: 2, type: "Event" },
  { id: 3, type: "Aggregate" },
  { id: 4, type: "Policy" },
  { id: 5, type: "ContextBox" },
  { id: 6, type: "Actor" },
  { id: 7, type: "ReadModel" },
]);

const colorMap: Record<string, string> = {
  Command: '#87ceeb',
  Event: '#ffb703',
  Aggregate: '#ffff99',
  Policy: '#ffc0cb',
  ContextBox: '#e9ecef',
  Actor: '#d0f4de',
  ReadModel: '#90ee90'
};

let draggedTool = ref<{id: number, type: string} | null>(null);
const handleToolDragStart = (tool: {id: number, type: string}) => { draggedTool.value = tool; };

const calculateItemHeight = (item: Partial<CanvasItem>) => {
  const baseHeight = 100;
  const propertyHeight = item.properties ? item.properties.length * 15 : 0;
  return baseHeight + propertyHeight;
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  if (!draggedTool.value || !stageRef.value) return;

  const stage = stageRef.value.getStage();
  stage.setPointersPositions(e);
  const pos = stage.getPointerPosition();
  if (!pos) return;

  const newItem: Omit<CanvasItem, 'id'> = {
    type: draggedTool.value.type,
    instanceName: `New ${draggedTool.value.type}`,
    properties: [],
    x: pos.x - (draggedTool.value.type === 'ContextBox' ? 200 : 100),
    y: pos.y - 50,
    width: draggedTool.value.type === 'ContextBox' ? 400 : 200,
    height: 100,
    rotation: 0,
    parent: null,
  };
  newItem.height = calculateItemHeight(newItem);
  
  store.addItem(newItem);
  draggedTool.value = null;
};

const handleUpdate = (updatedItem: CanvasItem) => {
  store.updateItem(updatedItem);
};

const getEdgePoint = (source: CanvasItem, target: CanvasItem) => {
    const sx = source.x + source.width / 2;
    const sy = source.y + source.height / 2;
    const tx = target.x + target.width / 2;
    const ty = target.y + target.height / 2;

    const dx = tx - sx;
    const dy = ty - sy;

    const angle = Math.atan2(dy, dx);

    const halfW = source.width / 2;
    const halfH = source.height / 2;

    const tan = Math.tan(angle);
    const region = (angle > -Math.PI / 4 && angle <= Math.PI / 4) ? 1 :
                   (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) ? 2 :
                   (angle > 3 * Math.PI / 4 || angle <= -3 * Math.PI / 4) ? 3 : 4;

    let x, y;
    switch (region) {
        case 1: x = sx + halfW; y = sy + halfW * tan; break;
        case 2: x = sx + halfH / tan; y = sy + halfH; break;
        case 3: x = sx - halfW; y = sy - halfW * tan; break;
        case 4: x = sx - halfH / tan; y = sy - halfH; break;
    }
    return { x, y };
};

const connectionPoints = computed(() => {
  return connectionsJSON.value.map((conn) => {
    const fromNode = canvasItemsJSON.value.find((item) => item.id === conn.from);
    const toNode = canvasItemsJSON.value.find((item) => item.id === conn.to);
    if (!fromNode || !toNode) return null;

    const fromPoint = getEdgePoint(fromNode, toNode);
    const toPoint = getEdgePoint(toNode, fromNode);

    return [fromPoint.x, fromPoint.y, toPoint.x, toPoint.y];

  }).filter((p): p is number[] => p !== null);
});

</script>

<template>
  <div class="container">
    <div class="toolbox">
      <h3>Toolbox</h3>
      <div v-for="tool in toolBox" :key="tool.id" class="tool-item" :style="{ backgroundColor: colorMap[tool.type] }" draggable="true" @dragstart="handleToolDragStart(tool)">
        {{ tool.type }}
      </div>
      <hr />
      <button @click="startConnection('Association')" class="connect-btn">
        Add Connection
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
          <v-arrow v-for="(points, index) in connectionPoints" :key="index" :config="{ points: points, stroke: 'black', fill: 'black', strokeWidth: 2 }" />
          <EventItem 
            v-for="item in canvasItemsJSON" 
            :key="item.id" 
            :item="item" 
            :highlighted="selectedItems.some(s => s.id === item.id)"
            @click="handleItemClick($event, item)" 
            @dragstart="(e) => handleItemDragStart(e, item)"
            @dragmove="handleItemDragMove"
            @dragend="handleItemDragEnd"
            @transformend="handleTransformEnd"
          />

          <v-transformer 
            ref="transformerRef" 
            :config="{
              boundBoxFunc: (oldBox, newBox) => newBox.width < 5 || newBox.height < 5 ? oldBox : newBox,
            }" 
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