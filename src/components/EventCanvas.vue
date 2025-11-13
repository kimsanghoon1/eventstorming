<script setup lang="ts">
import { ref, computed } from "vue";
import { store } from "../store";
import type { CanvasItem } from "../types";
import PropertiesPanel from "./PropertiesPanel.vue";
import { useCanvasLogic } from '../composables/useCanvasLogic';
import EventItem from './canvas-items/EventItem.vue';

const props = defineProps({
  highlightedItemIds: {
    type: Set as () => Set<number>,
    default: () => new Set<number>()
  },
  clickedItemId: {
    type: Number as () => number | null,
    default: null
  }
});

const emit = defineEmits(['item-click', 'item-dblclick', 'canvas-click']);

const scale = ref(0.7);

const {
  selectedItems,
  selectedConnections,
  stageRef,
  transformerRef,
  selectionRectRef,
  selection,
  stageConfig,
  startConnection,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleConnectionClick,
  handleTransformEnd,
  handleItemDragStart,
  handleItemDragMove,
  handleItemDragEnd,
  handleItemClick,
  handleItemDblClick,
} = useCanvasLogic();

const connectionButtonPosition = computed(() => {
  console.log('[Debug] Recalculating button position. Selected items:', selectedItems.value.length);
  if (selectedItems.value.length !== 1 || !stageRef.value) {
    return null;
  }

  const item = selectedItems.value[0];
  const stage = stageRef.value.getStage();
  const itemNode = stage.findOne(`.item-${item.id}`);

  if (!itemNode) {
    console.log('[Debug] Node not found for item:', item.id);
    return null;
  }
  
  const wrapper = stage.container().parentElement;
  if (!wrapper) {
    console.log('[Debug] Wrapper element not found.');
    return null;
  }
  
  const rect = itemNode.getClientRect({ relativeTo: wrapper });
  console.log('[Debug] Item rect relative to wrapper:', rect);

  const position = {
    top: `${rect.y + rect.height / 2 - 15}px`, // 15 is half of button height
    left: `${rect.x + rect.width + 10}px`, // 10 is for spacing
  };

  console.log('[Debug] Calculated button style:', position);
  return position;
});

const onCanvasItemClick = (e: Konva.KonvaEventObject<MouseEvent>, item: CanvasItem) => {
  handleItemClick(e, item); // For selection logic in composable
  emit('item-click', item.id); // For highlighting logic in BoardView
};

const onCanvasItemDblClick = (e: Konva.KonvaEventObject<MouseEvent>, item: CanvasItem) => {
  handleItemDblClick(e, item); // For properties panel logic in composable
};

const stageConfigScaled = computed(() => ({
  ...stageConfig.value,
  scaleX: scale.value,
  scaleY: scale.value,
}));

const handleStageClick = (e: any) => {
  // Check if the click was on the stage background
  if (e.target === e.target.getStage()) {
    emit('canvas-click');
  }
};

// stageConfig.draggable = true; // This is now controlled by the hand tool logic

const canvasItemsJSON = computed(() => {
  return store.reactiveItems.sort((a, b) => {
    if (a.type === 'ContextBox' && b.type !== 'ContextBox') {
      return -1;
    }
    if (a.type !== 'ContextBox' && b.type === 'ContextBox') {
      return 1;
    }
    return 0;
  });
});
const connectionsJSON = computed(() => store.reactiveConnections);

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

  // Get transformed pointer position
  const pointerPosition = stage.getPointerPosition();
  if (!pointerPosition) return;
  
  const transform = stage.getAbsoluteTransform().copy();
  transform.invert();
  const pos = transform.point(pointerPosition);
  
  if (!pos) return;

  const newItem: Omit<CanvasItem, 'id'> = {
    type: draggedTool.value.type,
    instanceName: `New ${draggedTool.value.type}`,
    properties: [],
    x: pos.x - (draggedTool.value.type === 'ContextBox' ? 200 : 100),
    y: pos.y - 50,
    width: draggedTool.value.type === 'ContextBox' ? 400 : 200,
    height: 100,
    rotation: Math.random() * 4 - 2, // Random rotation between -2 and +2 degrees
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
    const sx = source.x;
    const sy = source.y;
    const sw = source.width;
    const sh = source.height;
    const tx = target.x;
    const ty = target.y;
    const tw = target.width;
    const th = target.height;

    const sourceCenter = { x: sx + sw / 2, y: sy + sh / 2 };
    const targetCenter = { x: tx + tw / 2, y: ty + th / 2 };

    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    const angle = Math.atan2(dy, dx);

    if (angle > -Math.PI / 4 && angle <= Math.PI / 4) { // Right
        return { x: sx + sw, y: sourceCenter.y };
    } else if (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) { // Bottom
        return { x: sourceCenter.x, y: sy + sh };
    } else if (angle > 3 * Math.PI / 4 || angle <= -3 * Math.PI / 4) { // Left
        return { x: sx, y: sourceCenter.y };
    } else { // Top
        return { x: sourceCenter.x, y: sy };
    }
};

const connectionsWithDetails = computed(() => {
  return connectionsJSON.value.map((conn) => {
    const fromNode = canvasItemsJSON.value.find((item) => item.id === conn.from);
    const toNode = canvasItemsJSON.value.find((item) => item.id === conn.to);
    if (!fromNode || !toNode) return null;

    const fromPoint = getEdgePoint(fromNode, toNode);
    const toPoint = getEdgePoint(toNode, fromNode);

    // Determine if the connection should be highlighted
    const activeIds = new Set(props.highlightedItemIds);
    if (props.clickedItemId) {
      activeIds.add(props.clickedItemId);
    }
    const isHighlighted = activeIds.has(conn.from) && activeIds.has(conn.to);
    const isSelected = selectedConnections.value.some(sc => sc.id === conn.id);

    return {
      ...conn,
      id: conn.id,
      points: [fromPoint.x, fromPoint.y, toPoint.x, toPoint.y],
      fromNode,
      toNode,
      isHighlighted,
      isSelected,
    };
  }).filter((c): c is NonNullable<typeof c> => c !== null);
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

    <div 
      class="canvas-wrapper" 
      @drop="handleDrop" 
      @dragover.prevent
    >
      <v-stage 
        ref="stageRef" 
        :config="stageConfigScaled" 
        @mousedown="handleMouseDown" 
        @mousemove="handleMouseMove" 
        @mouseup="handleMouseUp"
        @click="handleStageClick"
      >
        <v-layer>
          <EventItem 
            v-for="item in canvasItemsJSON" 
            :key="item.id" 
            :item="item" 
            :scale="scale"
            :is-selected="selectedItems.some(s => s.id === item.id)"
            :is-downstream="highlightedItemIds.has(item.id)"
            @click="(e) => onCanvasItemClick(e, item)"
            @dblclick="(e) => onCanvasItemDblClick(e, item)"
            @dragstart="(e) => handleItemDragStart(e, item)"
            @dragmove="handleItemDragMove"
            @dragend="handleItemDragEnd"
            @transformend="handleTransformEnd"
          />
          <v-arrow v-for="conn in connectionsWithDetails" :key="conn.id" :config="{
              points: conn.points,
              stroke: conn.isSelected ? '#007bff' : (conn.isHighlighted ? '#FF4500' : 'black'),
              fill: conn.isSelected ? '#007bff' : (conn.isHighlighted ? '#FF4500' : 'black'),
              strokeWidth: conn.isSelected ? 4 : (conn.isHighlighted ? 3 : 2),
              hitStrokeWidth: 15, // Make line easier to click
              dash: (conn.fromNode.type === 'Event' && conn.toNode.type === 'Policy') ? [10, 5] : undefined,
              pointerLength: 10,
              pointerWidth: 10,
          }" @click="handleConnectionClick($event, conn)" />

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
      <!-- Connection Button -->
      <div 
        v-if="connectionButtonPosition" 
        class="connection-button"
        :style="connectionButtonPosition"
        title="Start connection"
        @click="startConnection('Association')"
      >
        +
      </div>
    </div>
  </div>
</template>

<style scoped>
.container { display: flex; width: 100%; height: 100%; flex-direction: row; }
.toolbox { width: 200px; padding: 15px; border-right: 1px solid #ccc; background-color: #f7f7f7; flex-shrink: 0; }
.tool-item { padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; cursor: grab; text-align: center; font-weight: bold; }
.canvas-wrapper { 
  flex-grow: 1; 
  overflow: auto;
  position: relative; /* Needed for the connection button */
}
.connect-btn { width: 100%; padding: 10px; background-color: #ffc107; border: none; cursor: pointer; }
.connect-btn.active { background-color: #e0a800; font-weight: bold; }

.connection-button {
  position: absolute;
  width: 30px;
  height: 30px;
  background-color: #007bff;
  color: white;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  line-height: 30px;
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  transition: transform 0.1s ease;
}
.connection-button:hover {
  transform: scale(1.1);
}
</style>