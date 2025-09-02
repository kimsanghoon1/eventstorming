<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Konva from 'konva';
import { store } from "../store";
import type { CanvasItem, Connection } from "../types";
import PropertiesPanel from "./PropertiesPanel.vue";
import ContextChildrenDialog from "./ContextChildrenDialog.vue";
import { useCanvasLogic } from '../composables/useCanvasLogic';
import EventItem from './canvas-items/EventItem.vue';

const {
  selectedItems,
  stageRef,
  transformerRef,
  selectionRectRef,
  selection,
  stageConfig,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleItemClick,
  handleTransformEnd,
} = useCanvasLogic();

// --- Dialog State ---
const isDialogVisible = ref(false);
const dialogContext = ref<CanvasItem | null>(null);

const showContextChildren = (e: Konva.KonvaEventObject<MouseEvent>, contextBox: CanvasItem) => {
  e.evt.stopPropagation();
  dialogContext.value = contextBox;
  isDialogVisible.value = true;
};

const closeDialog = () => {
  isDialogVisible.value = false;
  dialogContext.value = null;
};

// --- Configuration -- -
const colorMap: Record<string, string> = {
  Command: '#87ceeb',   // Sky Blue
  Event: '#ffb703',     // Orange
  Aggregate: '#ffff99', // Light Yellow
  Policy: '#ffc0cb',    // Pink
  ContextBox: '#e9ecef', // Light Gray
  Actor: '#d0f4de',      // Light Green
  ReadModel: '#90ee90'  // Light Green
};
const snapThreshold = 15;

const toolBox = ref([
  { id: 1, type: "Command" },
  { id: 2, type: "Event" },
  { id: 3, type: "Aggregate" },
  { id: 4, type: "Policy" },
  { id: 5, type: "ContextBox" },
  { id: 6, type: "Actor" },
  { id: 7, type: "ReadModel" },
]);

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

// --- Parenting & Attachment Logic ---
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

const findParentAggregate = (item: CanvasItem): CanvasItem | null => {
  for (const agg of categorizedItems.value.aggregates) {
    if (agg.id === item.id) continue;

    const itemRight = item.x + item.width;
    const aggRight = agg.x + agg.width;
    const itemBottom = item.y + item.height;
    const aggBottom = agg.y + agg.height;

    const isCloseHorizontally = item.x < aggRight + snapThreshold && itemRight > agg.x - snapThreshold;
    const isCloseVertically = item.y < aggBottom + snapThreshold && itemBottom > agg.y - snapThreshold;

    if (isCloseHorizontally && isCloseVertically) {
      return agg;
    }
  }
  return null;
};

const updateItemAttachment = (item: CanvasItem) => {
  const oldParentId = item.parent;
  const newParent = findParentAggregate(item);

  if (oldParentId === newParent?.id) return; // No change

  // Remove from old parent's children list
  if (oldParentId) {
    const oldParent = store.canvasItems.find(i => i.id === oldParentId);
    if (oldParent && oldParent.children) {
      oldParent.children = oldParent.children.filter(childId => childId !== item.id);
    }
  }

  // Add to new parent's children list
  if (newParent) {
    if (!newParent.children) {
      newParent.children = [];
    }
    if (!newParent.children.includes(item.id)) {
      newParent.children.push(item.id);
    }
    item.parent = newParent.id;
  } else {
    item.parent = null;
  }
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
  updateItemAttachment(newItem);
  if (!newItem.parent) {
    newItem.parent = findParentContext(newItem);
  }
  store.canvasItems.push(newItem);
  draggedTool.value = null;
  store.pushState();
};

// --- Canvas Item Interactions ---
const dragStartPositions = ref<Map<number, {x: number, y: number}>>(new Map());

const handleItemDragStart = (e: Konva.KonvaEventObject<DragEvent>, item: CanvasItem) => {
  const stage = stageRef.value?.getStage();
  if (!stage) return;

  if (!highlightedItemIds.value.has(item.id)) {
    selectedItems.value = [item];
  }
  
  dragStartPositions.value.clear();
  selectedItems.value.forEach(selectedItem => {
    const node = stage.findOne('.item-' + selectedItem.id);
    if (node) {
      dragStartPositions.value.set(selectedItem.id, { x: node.x(), y: node.y() });
    }
  });
};

const handleItemDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
  const stage = stageRef.value?.getStage();
  const draggedNode = e.target;
  const draggedItemId = Number(draggedNode.name().split('-')[1]);
  
  if (!stage || !dragStartPositions.value.has(draggedItemId)) return;

  const startPos = dragStartPositions.value.get(draggedItemId);
  if (!startPos) return;

  // Snapping logic
  let newX = draggedNode.x();
  let newY = draggedNode.y();
  const draggedItem = store.canvasItems.find(i => i.id === draggedItemId);

  if (draggedItem && ['Command', 'Event', 'Policy'].includes(draggedItem.type)) {
      categorizedItems.value.aggregates.forEach(agg => {
        if (selectedItems.value.some(i => i.id === agg.id)) return;

        const aggRight = agg.x + agg.width;
        const aggBottom = agg.y + agg.height;

        // Snap to aggregate edges
        if (Math.abs(newX - aggRight) < snapThreshold) newX = aggRight;
        if (Math.abs(newX + draggedNode.width() - agg.x) < snapThreshold) newX = agg.x - draggedNode.width();
        if (Math.abs(newY - aggBottom) < snapThreshold) newY = aggBottom;
        if (Math.abs(newY + draggedNode.height() - agg.y) < snapThreshold) newY = agg.y - draggedNode.height();
      });
  }

  draggedNode.x(newX);
  draggedNode.y(newY);

  const dx = draggedNode.x() - startPos.x;
  const dy = draggedNode.y() - startPos.y;

  selectedItems.value.forEach(item => {
    if (item.id === draggedItemId) return; 

    const node = stage.findOne('.item-' + item.id);
    const initialPos = dragStartPositions.value.get(item.id);
    if (node && initialPos) {
      node.x(initialPos.x + dx);
      node.y(initialPos.y + dy);
    }
  });
};

const handleItemDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
  selectedItems.value.forEach(item => {
    const storeItem = store.canvasItems.find(i => i.id === item.id);
    const node = stageRef.value?.getStage()?.findOne('.item-' + item.id);
    if (storeItem && node) {
      const oldX = storeItem.x;
      const oldY = storeItem.y;
      const newX = node.x();
      const newY = node.y();

      storeItem.x = newX;
      storeItem.y = newY;
      
      updateItemAttachment(storeItem);
      if (storeItem.type !== 'ContextBox') {
        storeItem.parent = findParentContext(storeItem);
      }

      if (storeItem.type === 'ContextBox') {
        const dx = newX - oldX;
        const dy = newY - oldY;
        store.canvasItems.forEach(child => {
          if (child.parent === storeItem.id) {
            child.x += dx;
            child.y += dy;
          }
        });
      }
    }
  });
  dragStartPositions.value.clear();
  store.pushState();
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
    store.pushState();
  }
};

// --- Transformer & Highlighting Logic ---
const highlightedItemIds = computed(() => {
  const ids = new Set<number>();
  if (connectingMode.value && sourceNodeId.value) {
    ids.add(sourceNodeId.value);
  }
  selectedItems.value.forEach(item => {
    ids.add(item.id);
    // Find connected items and add them
    store.connections.forEach(conn => {
      if (conn.from === item.id) {
        ids.add(conn.to);
      }
      if (conn.to === item.id) {
        ids.add(conn.from);
      }
    });
  });
  return ids;
});

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
      const sourceItem = store.canvasItems.find(i => i.id === sourceNodeId.value);
      if (!sourceItem) return;

      const newConnection: Connection = { 
        id: `conn-${sourceNodeId.value}-${targetItem.id}`,
        from: sourceNodeId.value, 
        to: targetItem.id 
      };
      if (!store.connections.find(c => c.id === newConnection.id)) { 
        store.connections.push(newConnection);

        // Update data structure for Event -> Policy connection
        if (sourceItem.type === 'Event' && targetItem.type === 'Policy') {
          if (!sourceItem.connectedPolicies) sourceItem.connectedPolicies = [];
          sourceItem.connectedPolicies.push(targetItem.id);
        }
        if (sourceItem.type === 'Policy' && targetItem.type === 'Event') {
          const eventItem = store.canvasItems.find(i => i.id === targetItem.id);
          if (eventItem) {
            if (!eventItem.connectedPolicies) eventItem.connectedPolicies = [];
            eventItem.connectedPolicies.push(sourceItem.id);
          }
        }
        store.pushState();
      }
    }
    sourceNodeId.value = null;
    connectingMode.value = false;
  }
};
const connectionPoints = computed(() => {
  return store.connections.map((conn) => {
    const fromNode = store.canvasItems.find((item) => item.id === conn.from);
    const toNode = store.canvasItems.find((item) => item.id === conn.to);
    if (!fromNode || !toNode) return null;

    const fromX = fromNode.x;
    const fromY = fromNode.y;
    const toX = toNode.x;
    const toY = toNode.y;
    const fromWidth = fromNode.width;
    const fromHeight = fromNode.height;
    const toWidth = toNode.width;
    const toHeight = toNode.height;

    const fromCenterX = fromX + fromWidth / 2;
    const fromCenterY = fromY + fromHeight / 2;
    const toCenterX = toX + toWidth / 2;
    const toCenterY = toY + toHeight / 2;

    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;

    let startPoint, endPoint;

    if (Math.abs(dx) > Math.abs(dy)) { // Horizontal connection
      if (dx > 0) { // from -> to (left to right)
        startPoint = { x: fromX + fromWidth, y: fromCenterY };
        endPoint = { x: toX, y: toCenterY };
      } else { // from -> to (right to left)
        startPoint = { x: fromX, y: fromCenterY };
        endPoint = { x: toX + toWidth, y: toCenterY };
      }
      const midX = fromCenterX + dx / 2;
      return [startPoint.x, startPoint.y, midX, startPoint.y, midX, endPoint.y, endPoint.x, endPoint.y];
    } else { // Vertical connection
      if (dy > 0) { // from -> to (top to bottom)
        startPoint = { x: fromCenterX, y: fromY + fromHeight };
        endPoint = { x: toCenterX, y: toY };
      } else { // from -> to (bottom to top)
        startPoint = { x: fromCenterX, y: fromY };
        endPoint = { x: toCenterX, y: toY + toHeight };
      }
      const midY = fromCenterY + dy / 2;
      return [startPoint.x, startPoint.y, startPoint.x, midY, endPoint.x, midY, endPoint.x, endPoint.y];
    }

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
          <EventItem 
            v-for="item in store.canvasItems" 
            :key="item.id" 
            :item="item" 
            :highlighted="highlightedItemIds.has(item.id)"
            @click="handleItemClick($event, item)" 
            @dragstart="handleItemDragStart($event, item)"
            @dragmove="handleItemDragMove"
            @dragend="handleItemDragEnd($event)"
            @transformend="handleTransformEnd"
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
    
    <ContextChildrenDialog v-if="isDialogVisible" :modelValue="dialogContext" :visible="isDialogVisible" @close="closeDialog" />
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
