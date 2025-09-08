<script setup lang="ts">
import { ref, computed } from "vue";
import { store } from "../store";
import type { CanvasItem } from "../types";
import PropertiesPanel from "./PropertiesPanel.vue";
import UmlItem from "./canvas-items/UmlItem.vue";
import UmlConnection from "./canvas-items/UmlConnection.vue";
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

const canvasItemsJSON = computed(() => store.canvasItems?.toJSON() ?? []);
const connectionsJSON = computed(() => store.connections?.toJSON() ?? []);

const umlToolBox = ref([
  { id: 1, type: "Class" },
  { id: 2, type: "Interface" },
  { id: 3, type: "Enum" },
]);

const connectionTools = ref([
    { type: 'Association' },
    { type: 'Aggregation' },
    { type: 'Composition' },
    { type: 'Generalization' },
    { type: 'Dependency' },
]);

let draggedTool = ref<{id: number, type: string} | null>(null);
const handleToolDragStart = (tool: {id: number, type: string}) => { draggedTool.value = tool; };

const calculateUmlItemHeight = (item: Partial<CanvasItem>) => {
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

  const newItem: Omit<CanvasItem, 'id'> = {
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
  };
  
  if (['Class', 'Interface', 'Component', 'Package'].includes(newItem.type)) {
    newItem.height = calculateUmlItemHeight(newItem);
  }

  store.addItem(newItem);
  draggedTool.value = null;
};

const handleUpdate = (updatedItem: CanvasItem) => {
  if (['Class', 'Interface', 'Component', 'Package'].includes(updatedItem.type)) {
    updatedItem.height = calculateUmlItemHeight(updatedItem);
  }
  store.updateItem(updatedItem);
};

const getConnectionItems = (conn: any) => {
    const fromItem = canvasItemsJSON.value.find(i => i.id === conn.from);
    const toItem = canvasItemsJSON.value.find(i => i.id === conn.to);
    return { fromItem, toItem };
};

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
          <template v-for="conn in connectionsJSON" :key="conn.id">
            <UmlConnection 
              v-if="getConnectionItems(conn).fromItem && getConnectionItems(conn).toItem"
              :connection="conn"
              :fromItem="getConnectionItems(conn).fromItem!"
              :toItem="getConnectionItems(conn).toItem!"
            />
          </template>

          <UmlItem 
            v-for="item in canvasItemsJSON" 
            :key="item.id" 
            :item="item"
            @click="(e) => handleItemClick(e, item)" 
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
.canvas-wrapper { flex-grow: 1; overflow: auto; }
</style>