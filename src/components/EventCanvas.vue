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
import { getEdgePoint } from '@/utils/canvas';

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

const activePreviewIds = computed(() => {
  const ids = new Set<number>();
  selectedItems.value.forEach(item => ids.add(item.id));
  props.highlightedItemIds.forEach(id => ids.add(id));
  return ids;
});

const commandEventPreviews = computed(() => {
  if (!activePreviewIds.value.size) return [];
  return store.reactiveItems
    .filter(item => (
      (item.type === 'Command' || item.type === 'Policy') &&
      item.producesEventId &&
      activePreviewIds.value.has(item.id)
    ))
    .map(item => {
      const target = store.getItemById(item.producesEventId!);
      if (!target) return null;
      if (item.parent === null || target.parent === null) return null;
      if (item.parent !== target.parent) return null;

      const fromPoint = getEdgePoint(item, target);
      const toPoint = getEdgePoint(target, item);
      return {
        id: `command-preview-${item.id}-${target.id}`,
        points: [fromPoint.x, fromPoint.y, toPoint.x, toPoint.y],
      };
    })
    .filter((entry): entry is { id: string; points: number[] } => Boolean(entry));
});

const activeUsers = computed(() => Array.from(store.awarenessUsers.values()));
</script>

<template>
  <div class="relative flex h-screen w-full flex-col overflow-hidden bg-background-light dark:bg-background-dark font-display text-gray-800 dark:text-gray-200">
    <!-- Main Content -->
    <main class="relative flex-1 overflow-hidden">
      <!-- Canvas -->
      <div 
        class="absolute inset-0 bg-dots"
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
              :locked-by="Array.from(store.awarenessUsers.values()).find(u => u.selectedItemId === item.id)"
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
            <v-arrow
              v-for="preview in commandEventPreviews"
              :key="preview.id"
              :config="{
                points: preview.points,
                stroke: '#7c3aed',
                dash: [12, 6],
                strokeWidth: 3,
                pointerLength: 12,
                pointerWidth: 12,
                opacity: 0.9
              }"
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
          class="absolute z-50 flex items-center justify-center w-9 h-9 bg-white text-blue-500 border border-gray-200 rounded-full cursor-pointer hover:scale-110 hover:bg-gray-50 hover:text-blue-700 transition-all"
          :style="connectionButtonPosition"
          title="Start connection"
          @click="startConnection('Association')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="absolute top-4 left-4 z-20">
        <div class="flex items-center gap-1 p-1.5 bg-background-light dark:bg-background-dark border border-gray-200 dark:border-gray-700 rounded-xl">
          <div 
            v-for="tool in toolBox" 
            :key="tool.id" 
            class="p-2.5 rounded-lg cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300 transition-colors"
            :style="{ borderLeft: `4px solid ${colorMap[tool.type]}` }"
            draggable="true" 
            @dragstart="handleToolDragStart(tool)"
            :title="tool.type"
          >
             <!-- Simple icons based on type -->
             <span v-if="tool.type === 'Command'" class="material-symbols-outlined text-blue-400">terminal</span>
             <span v-else-if="tool.type === 'Event'" class="material-symbols-outlined text-orange-400">bolt</span>
             <span v-else-if="tool.type === 'Aggregate'" class="material-symbols-outlined text-yellow-200">layers</span>
             <span v-else-if="tool.type === 'Policy'" class="material-symbols-outlined text-pink-300">gavel</span>
             <span v-else-if="tool.type === 'ContextBox'" class="material-symbols-outlined text-gray-400">crop_square</span>
             <span v-else-if="tool.type === 'Actor'" class="material-symbols-outlined text-green-200">person</span>
             <span v-else-if="tool.type === 'ReadModel'" class="material-symbols-outlined text-green-400">visibility</span>
             <span v-else class="material-symbols-outlined">circle</span>
          </div>
          <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>
          <button 
            class="p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
            @click="startConnection('Association')"
            title="Add Connection"
          >
            <span class="material-symbols-outlined">timeline</span>
          </button>
        </div>
      </div>

      <!-- User Presence List -->
      <div class="absolute top-4 right-4 z-20 flex items-center gap-[-8px]">
        <div 
          v-for="user in activeUsers" 
          :key="user.clientId"
          class="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 shadow-sm text-xs font-bold text-white relative -ml-2 first:ml-0 transition-transform hover:z-10 hover:scale-110 cursor-default"
          :style="{ backgroundColor: user.color }"
          :title="user.name"
        >
          {{ user.name.charAt(0).toUpperCase() }}
        </div>
        <div v-if="activeUsers.length === 0" class="px-3 py-1.5 bg-white/80 dark:bg-black/50 backdrop-blur rounded-full text-xs font-medium text-gray-500 border border-gray-200 dark:border-gray-700">
           No other users
        </div>
      </div>

      <!-- View Controls / FAB -->
      <div class="absolute bottom-5 right-5 z-20 flex flex-col items-end gap-2 pointer-events-none">
        <div class="pointer-events-auto">
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
        
        <div class="flex items-center gap-1 p-1.5 bg-background-light dark:bg-background-dark border border-gray-200 dark:border-gray-700 rounded-xl pointer-events-auto">
          <button @click="zoomOut" :disabled="scale <= MIN_SCALE" class="p-2 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-50">
            <span class="material-symbols-outlined text-base">remove</span>
          </button>
          <span class="truncate text-sm font-bold text-gray-800 dark:text-white px-2 min-w-[3rem] text-center">{{ scalePercent }}%</span>
          <button @click="zoomIn" :disabled="scale >= MAX_SCALE" class="p-2 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-50">
            <span class="material-symbols-outlined text-base">add</span>
          </button>
          <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1"></div>
          <button @click="resetZoom" class="p-2 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50" title="Reset Zoom">
            <span class="material-symbols-outlined text-base">fullscreen</span>
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.bg-dots {
  background-color: #fafaf8;
  background-image: radial-gradient(circle at 1px 1px, hsla(0, 0%, 0%, 0.1) 1px, transparent 0);
  background-size: 20px 20px;
}
.dark .bg-dots {
  background-color: #fafaf8;
  background-image: radial-gradient(circle at 1px 1px, hsla(0, 0%, 100%, 0.1) 1px, transparent 0);
}
</style>