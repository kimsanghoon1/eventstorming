<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import type { PropType, Ref } from "vue";
import type { KonvaEventObject } from "konva/lib/Node";
import { useStore } from "@/store";
import type { Connection, CanvasItem } from "@/types";
import UmlItem from "./canvas-items/UmlItem.vue";
import UmlConnection from "./canvas-items/UmlConnection.vue";
import { useCanvasLogic } from '../composables/useCanvasLogic';
import MiniMap from './MiniMap.vue';
import { ensureUmlItemDimensions } from '@/utils/uml';

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
  connectionMode,
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

const updateStageSizeToFit = () => {
  const el = canvasWrapperRef.value;
  if (!el) return;
  
  const items = store.reactiveItems ?? [];
  let maxX = 0;
  let maxY = 0;
  
  items.forEach(item => {
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  });
  
  const padding = 200;
  const minWidth = el.clientWidth;
  const minHeight = el.clientHeight;
  
  stageConfigRef.value.width = Math.max(maxX + padding, minWidth);
  stageConfigRef.value.height = Math.max(maxY + padding, minHeight);
};

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
    updateStageSizeToFit();
    attachStageViewportListeners();
    updateViewport();
  });
  canvasWrapperRef.value?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', () => {
    updateStageSizeToFit();
    updateViewport();
  });
});

onBeforeUnmount(() => {
  canvasWrapperRef.value?.removeEventListener('scroll', updateViewport);
  window.removeEventListener('resize', updateViewport); // Note: anonymous function above won't be removed, but component unmount cleans up
  stageRef.value?.getStage()?.off('.minimap');
});

watch(stageRef, () => {
  nextTick(() => {
    updateStageSizeToFit();
    attachStageViewportListeners();
    updateViewport();
  });
});

watch(
  () => [stageConfigRef.value.width, stageConfigRef.value.height, scale.value],
  () => updateViewport()
);

// Watch items to resize stage if needed
watch(() => store.reactiveItems.length, () => {
  nextTick(updateStageSizeToFit);
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

const canvasItemsJSON = computed(() => store.reactiveItems);
const umlConnections = computed(() => {
  if (!store.reactiveConnections?.length) return [];
  return store.reactiveConnections
    .map(conn => {
      const fromItem = store.reactiveItems.find(item => item.id === conn.from);
      const toItem = store.reactiveItems.find(item => item.id === conn.to);
      if (!fromItem || !toItem) return null;
      return { conn, fromItem, toItem };
    })
    .filter((value): value is { conn: Connection; fromItem: CanvasItem; toItem: CanvasItem } => value !== null);
});

const umlToolBox = ref([
  { id: 1, type: "Class", label: "Class" },
  { id: 2, type: "Interface", label: "Interface" },
  { id: 3, type: "Enum", label: "Enum" },
]);

const connectionTools = ref([
    { type: 'Association', label: 'Association' },
    { type: 'Aggregation', label: 'Aggregation' },
    { type: 'Composition', label: 'Composition' },
    { type: 'Generalization', label: 'Generalization' },
    { type: 'Dependency', label: 'Dependency' },
]);

let draggedTool = ref<{id: number, type: string} | null>(null);
const handleToolDragStart = (tool: {id: number, type: string}) => { draggedTool.value = tool; };
const onToolDragStart = (e: DragEvent, tool: any) => handleToolDragStart(tool);

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

  const newItem: Omit<CanvasItem, 'id'> = ensureUmlItemDimensions({
    type: draggedTool.value.type,
    instanceName: `New ${draggedTool.value.type}`,
    properties: [],
    attributes: [],
    methods: [],
    x: pos.x - 100,
    y: pos.y - 50,
    width: 200,
    height: 100,
    rotation: 0,
    parent: null,
  });

  store.addItem(newItem);
  draggedTool.value = null;
};

const handleUpdate = (updatedItem: CanvasItem) => {
  const normalized = ensureUmlItemDimensions(updatedItem);
  store.updateItem(normalized);
};

const isConnectionHighlighted = (conn: Connection) => {
  const allHighlightedIds = new Set(props.highlightedItemIds);
  if (props.clickedItemId) {
    allHighlightedIds.add(props.clickedItemId);
  }
  return allHighlightedIds.has(conn.from) && allHighlightedIds.has(conn.to);
};

const isConnectionSelected = (conn: Connection) => {
  return selectedConnections.value.some(c => c.id === conn.id);
};

// Map event handlers for template
const onCanvasClick = handleStageClick;
const onItemClick = onCanvasItemClick;
const onItemDblClick = onCanvasItemDblClick;
</script>

<template>
  <div class="flex flex-row w-full h-full min-w-0">
    <div class="w-[200px] shrink-0 p-4 bg-surface-light dark:bg-surface-dark border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto">
      <div class="mb-5">
        <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">UML Toolbox</h3>
        <div 
          v-for="tool in umlToolBox" 
          :key="tool.type"
          class="p-2.5 mb-2.5 text-center font-bold cursor-grab rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-all"
          draggable="true"
          @dragstart="onToolDragStart($event, tool)"
        >
          {{ tool.label }}
        </div>
      </div>

      <div>
        <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Connections</h3>
        <div 
          v-for="conn in connectionTools" 
          :key="conn.type"
          class="p-2.5 mb-2.5 text-center font-bold cursor-pointer rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-all"
          :class="{ 'ring-2 ring-blue-500 dark:ring-blue-400 bg-blue-50 dark:bg-blue-900/20': connectionMode.active && connectionMode.type === conn.type }"
          @click="startConnection(conn.type)"
        >
          {{ conn.label }}
        </div>
      </div>
    </div>

    <div class="flex-1 h-full relative overflow-hidden bg-[#fafaf8]" ref="canvasWrapperRef">
      <v-stage
        ref="stageRef"
        :config="stageConfigScaled"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
        @click="onCanvasClick"
        @dragstart="handleItemDragStart"
        @dragmove="handleItemDragMove"
        @dragend="handleItemDragEnd"
      >
        <v-layer>
          <!-- Connections -->
          <UmlConnection 
            v-for="link in umlConnections"
            :key="link.conn.id"
            :connection="link.conn"
            :name="'conn-' + link.conn.id"
            :fromItem="link.fromItem"
            :toItem="link.toItem"
            :isSelected="isConnectionSelected(link.conn)"
            :isHighlighted="isConnectionHighlighted(link.conn)"
            @connection-click="handleConnectionClick"
          />

          <!-- Items -->
          <UmlItem 
            v-for="item in canvasItemsJSON" 
            :key="item.id" 
            :item="item"
            :scale="scale"
            :is-selected="selectedItems.some(s => s.id === item.id)"
            :is-downstream="highlightedItemIds.has(item.id)"
            :change-kind="store.recentChangeMap[item.id]"
            @click="(e) => onItemClick(e, item)"
            @dblclick="(e) => onItemDblClick(e, item)"
            @dragstart="(e) => onDragStart(e, item)"
            @dragmove="(e) => onDragMove(e, item)"
            @dragend="(e) => onDragEnd(e, item)"
            @transform="(e) => handleItemTransform(e, item)"
            @transformend="handleTransformEnd"
          />

          <v-transformer 
            ref="transformerRef" 
            :config="{
              boundBoxFunc: (oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) {
                  return oldBox;
                }
                return newBox;
              },
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

      <div class="map-and-zoom">
        <MiniMap 
          v-if="store.reactiveItems.length"
          :items="store.reactiveItems"
          :connections="store.reactiveConnections"
          :stage-width="stageConfig.width"
          :stage-height="stageConfig.height"
          :viewport="viewport"
          :scale="scale"
        />
        
        <div class="zoom-controls bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 shadow-lg backdrop-blur-sm">
          <button @click="zoomOut" :disabled="scale <= MIN_SCALE" class="hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
            <span class="material-symbols-outlined">remove</span>
          </button>
          <span class="px-2 min-w-[3rem] text-center text-sm font-bold text-gray-800 dark:text-gray-200">{{ Math.round(scale * 100) }}%</span>
          <button @click="zoomIn" :disabled="scale >= MAX_SCALE" class="hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
            <span class="material-symbols-outlined">add</span>
          </button>
          <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
          <button @click="resetZoom" class="reset hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs">
            Reset
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  border-radius: 999px;
  padding: 6px 12px;
}
.zoom-controls button {
  border: none;
  background: transparent;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.zoom-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.zoom-controls .reset {
  width: auto;
  border-radius: 12px;
  padding: 0 10px;
}
</style>
