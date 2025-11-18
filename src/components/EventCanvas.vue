<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import type { PropType, Ref } from "vue";
import type { KonvaEventObject } from 'konva/lib/Node';
import { useStore } from '@/store';
import EventItem from './canvas-items/EventItem.vue';
import ConnectionArrow from './canvas-items/ConnectionArrow.vue';
import type { CanvasItem } from '@/types';
import { useCanvasLogic } from '../composables/useCanvasLogic';
import MiniMap from './MiniMap.vue';

const props = defineProps({
  highlightedItemIds: {
    type: Object as PropType<Set<number>>,
    default: () => new Set<number>()
  },
  clickedItemId: {
    type: Number as PropType<number | null>,
    default: null
  }
});

const emit = defineEmits(['item-click', 'item-dblclick', 'canvas-click']);

const store = useStore();
const stageRef = ref<any>(null);
const DEFAULT_SCALE = 0.7;
const MIN_SCALE = 0.4;
const MAX_SCALE = 1.8;
const ZOOM_STEP = 0.1;
const scale = ref(DEFAULT_SCALE);
const {
  selectedItems,
  selectedConnections,
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
  handleItemTransform,
  handleItemDblClick,
} = useCanvasLogic(stageRef);

const setScale = (value: number) => {
  scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
  updateViewport();
};
const zoomIn = () => setScale(scale.value + ZOOM_STEP);
const zoomOut = () => setScale(scale.value - ZOOM_STEP);
const resetZoom = () => setScale(DEFAULT_SCALE);
const scalePercent = computed(() => Math.round(scale.value * 100));

type BoundBox = { width: number; height: number; x: number; y: number };
const boundBoxFunc = (oldBox: BoundBox, newBox: BoundBox) =>
  newBox.width < 5 || newBox.height < 5 ? oldBox : newBox;

const stageConfigRef = stageConfig as unknown as Ref<{ width: number; height: number }>;
const stageSize = computed(() => ({
  width: stageConfigRef.value.width,
  height: stageConfigRef.value.height,
}));

const canvasWrapperRef = ref<HTMLElement | null>(null);
const viewport = ref({
  width: 0,
  height: 0,
  scrollLeft: 0,
  scrollTop: 0,
  stageX: 0,
  stageY: 0,
  stageWidth: 0,
  stageHeight: 0,
  stageScale: 1,
});

const updateViewport = () => {
  const el = canvasWrapperRef.value;
  if (!el) return;
  const stage = stageRef.value?.getStage();
  const stagePos = stage?.position() ?? { x: 0, y: 0 };
  const stageScale = stage?.scaleX() ?? scale.value ?? 1;
  viewport.value = {
    width: el.clientWidth,
    height: el.clientHeight,
    scrollLeft: el.scrollLeft,
    scrollTop: el.scrollTop,
    stageX: (el.scrollLeft - stagePos.x) / stageScale,
    stageY: (el.scrollTop - stagePos.y) / stageScale,
    stageWidth: el.clientWidth / stageScale,
    stageHeight: el.clientHeight / stageScale,
    stageScale,
  };
};

const attachStageViewportListeners = () => {
  const stage = stageRef.value?.getStage();
  if (!stage) return;
  stage.off('.minimap');
  stage.on('dragmove.minimap', updateViewport);
  stage.on('dragend.minimap', updateViewport);
};

onMounted(() => {
  nextTick(() => {
    attachStageViewportListeners();
    updateViewport();
  });
  canvasWrapperRef.value?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);
});

onBeforeUnmount(() => {
  canvasWrapperRef.value?.removeEventListener('scroll', updateViewport);
  window.removeEventListener('resize', updateViewport);
  stageRef.value?.getStage()?.off('.minimap');
});

watch(stageRef, () => {
  nextTick(() => {
    attachStageViewportListeners();
    updateViewport();
  });
});

watch(
  () => [stageConfigRef.value.width, stageConfigRef.value.height, scale.value],
  () => updateViewport()
);

const selectedItemBounds = computed(() => {
  if (selectedItems.value.length !== 1) return null;
  const latest = store.getItemById(selectedItems.value[0].id);
  if (!latest) return null;
  return {
    id: latest.id,
    x: latest.x,
    y: latest.y,
    width: latest.width,
    height: latest.height,
  };
});

const connectionButtonPosition = computed(() => {
  if (!selectedItemBounds.value || !stageRef.value) {
    return null;
  }

  const stage = stageRef.value.getStage();
  const itemNode = stage.findOne(`.item-${selectedItemBounds.value.id}`);

  if (!itemNode) {
    return null;
  }
  
  const wrapper = stage.container().parentElement;
  if (!wrapper) {
    return null;
  }
  
  const rect = itemNode.getClientRect({ relativeTo: wrapper });

  return {
    top: `${rect.y + rect.height / 2 - 15}px`,
    left: `${rect.x + rect.width + 10}px`,
  };
});

const onDragStart = (e: KonvaEventObject<DragEvent>, item: CanvasItem) => {
  handleItemDragStart(e, item);
};
const onDragMove = (e: KonvaEventObject<DragEvent>, item: CanvasItem) => {
  handleItemDragMove(e, item);
};
const onDragEnd = (e: KonvaEventObject<DragEvent>, item: CanvasItem) => {
  handleItemDragEnd(e, item);
};


const onCanvasItemClick = (e: KonvaEventObject<MouseEvent>, item: CanvasItem) => {
  handleItemClick(e, item);
  emit('item-click', item.id);
};

const onCanvasItemDblClick = (e: KonvaEventObject<MouseEvent>, item: CanvasItem) => {
  handleItemDblClick(e, item);
};

const stageConfigScaled = computed(() => ({
  ...stageConfig.value,
  scaleX: scale.value,
  scaleY: scale.value,
}));

const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
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
  ContextBox: '#fafaf8',
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

const connectionsWithDetails = computed(() => {
  if (!store.reactiveConnections) return [];
  
  return store.reactiveConnections.map(conn => {
    const allHighlightedIds = new Set(props.highlightedItemIds);
    if (props.clickedItemId) {
      allHighlightedIds.add(props.clickedItemId);
    }
    const isHighlighted = allHighlightedIds.has(conn.from) && allHighlightedIds.has(conn.to);
    const isSelected = selectedConnections.value.some(c => c.id === conn.id);

    return {
      ...conn,
      isHighlighted,
      isSelected,
    };
  });
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
      ref="canvasWrapperRef"
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
            :change-kind="store.recentChangeMap[item.id]"
            @click="(e) => onCanvasItemClick(e, item)"
            @dblclick="(e) => onCanvasItemDblClick(e, item)"
            @dragstart="(e) => onDragStart(e, item)"
            @dragmove="(e) => onDragMove(e, item)"
            @dragend="(e) => onDragEnd(e, item)"
            @transform="(e) => handleItemTransform(e, item)"
            @transformend="handleTransformEnd"
          />
          <ConnectionArrow
            v-for="conn in connectionsWithDetails"
            :key="conn.id"
            :connection="conn"
            :isHighlighted="conn.isHighlighted"
            :isSelected="conn.isSelected"
            @click="handleConnectionClick($event, conn)"
          />

          <v-transformer 
            ref="transformerRef" 
            :config="{
              boundBoxFunc
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
      <div class="map-and-zoom">
        <div class="zoom-controls">
          <button @click="zoomOut" :disabled="scale <= MIN_SCALE">-</button>
          <span>{{ scalePercent }}%</span>
          <button @click="zoomIn" :disabled="scale >= MAX_SCALE">+</button>
          <button class="reset" @click="resetZoom">Reset</button>
        </div>
        <MiniMap 
          v-if="canvasItemsJSON.length"
          :items="canvasItemsJSON"
          :connections="store.reactiveConnections || []"
          :stage-width="stageSize.width"
          :stage-height="stageSize.height"
          :viewport="viewport"
          :scale="scale"
        />
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

.map-and-zoom {
  position: fixed;
  right: 28px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 10;
  pointer-events: none;
}
.map-and-zoom > * {
  pointer-events: auto;
}
.zoom-controls {
  display: flex;
  gap: 6px;
  align-items: center;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #ddd;
  border-radius: 999px;
  padding: 6px 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.zoom-controls button {
  border: none;
  background: #f0f0f0;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  font-weight: bold;
  cursor: pointer;
}
.zoom-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.zoom-controls .reset {
  width: auto;
  border-radius: 12px;
  padding: 0 10px;
}
</style>