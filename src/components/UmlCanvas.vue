<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import Konva from 'konva';
import { store } from "../store";
import type { CanvasItem, Connection } from "../types";
import PropertiesPanel from "./PropertiesPanel.vue";
import ObjectProperties from "./ObjectProperties.vue";

const umlToolBox = ref([
  { id: 1, type: "Class" },
  { id: 2, type: "Interface" },
]);

const stageConfig = ref({ width: 100, height: 100 });
const stageRef = ref<{ getStage: () => Konva.Stage } | null>(null);

const handleResize = () => {
  const wrapper = document.querySelector('.canvas-wrapper');
  if (wrapper) {
    stageConfig.value = {
      width: wrapper.clientWidth,
      height: wrapper.clientHeight,
    };
  }
};

onMounted(() => {
  handleResize();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
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
  if (newItem.type === 'Class' || newItem.type === 'Interface') {
    newItem.height = calculateUmlItemHeight(newItem);
  }
  store.canvasItems.push(newItem);
  draggedTool.value = null;
  store.pushState();
};

const selectedItems = ref<CanvasItem[]>([]);
const handleItemClick = (e: Konva.KonvaEventObject<MouseEvent>, item: CanvasItem) => {
  selectedItems.value = [item];
};

const handleUpdate = (updatedItem: CanvasItem) => {
  const index = store.canvasItems.findIndex((i: CanvasItem) => i.id === updatedItem.id);
  if (index !== -1) {
    if (updatedItem.type === 'Class' || updatedItem.type === 'Interface') {
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
    if (item.type === 'Class' || item.type === 'Interface') {
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
      <button @click="store.showEventCanvas()">Back to Event Canvas</button>
    </div>

    <div class="canvas-wrapper" @drop="handleDrop" @dragover.prevent>
      <v-stage 
        ref="stageRef" 
        :config="stageConfig"
      >
        <v-layer>
          <v-group v-for="item in store.canvasItems" :key="item.id" :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0, dragDistance: 10 }" @click="handleItemClick($event, item)">
            <v-rect :config="{
              width: item.width,
              height: item.height,
              fill: '#ffffff',
              stroke: 'black',
              strokeWidth: 2,
            }" />
            <v-text v-if="item.type === 'Interface'" :config="{ text: '<<interface>>', fontSize: 14, width: item.width, padding: 5, align: 'center' }" />
            <v-text :config="{ text: item.instanceName, fontSize: 16, width: item.width, padding: item.type === 'Interface' ? 20 : 10, align: 'center' }" />
            <v-line v-if="item.type === 'Class'" :config="{ points: [0, 40, item.width, 40], stroke: 'black', strokeWidth: 1 }" />
            <ObjectProperties :attributes="item.attributes" :methods="item.methods" :itemWidth="item.width" />
            <v-line v-if="item.type === 'Class'" :config="{ points: [0, 40 + (item.attributes?.length || 0) * 15 + 15, item.width, 40 + (item.attributes?.length || 0) * 15 + 15], stroke: 'black', strokeWidth: 1 }" />
          </v-group>
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
