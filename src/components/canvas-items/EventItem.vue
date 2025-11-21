<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from "vue";
import type { CanvasItem } from "../../types";
import type { KonvaEventObject } from "konva/lib/Node";
import Konva from 'konva';
const props = defineProps<{
  item: CanvasItem;
  scale: number;
  isSelected: boolean;
  isDownstream: boolean;
  changeKind?: 'added' | 'updated';
}>();

const emit = defineEmits(['click', 'dblclick', 'dragstart', 'dragmove', 'dragend', 'transform', 'transformend']);

const rectRef = ref<Konva.Rect | null>(null);
let anim: Konva.Animation | null = null;
let node: any = null;
const highlightColor = '#FF4500'; // OrangeRed for high visibility
const changeHighlightMap: Record<'added' | 'updated', string> = {
  added: '#16a34a',
  updated: '#0ea5e9',
};
const changeShadowColor = computed(() => (props.changeKind ? changeHighlightMap[props.changeKind] : null));

const groupConfig = computed(() => ({
  x: props.item.x,
  y: props.item.y,
  draggable: true,
  name: `item-${props.item.id}`,
  rotation: props.item.rotation || 0,
  dragDistance: 10,
  onDragstart: (e: KonvaEventObject<DragEvent>) => emit('dragstart', e, props.item),
  onDragmove: (e: KonvaEventObject<DragEvent>) => emit('dragmove', e, props.item),
  onDragend: (e: KonvaEventObject<DragEvent>) => emit('dragend', e, props.item),
  onClick: (e: KonvaEventObject<MouseEvent>) => { e.evt.preventDefault(); emit('click', e, props.item); },
  onTap: (e: KonvaEventObject<Event>) => { e.evt.preventDefault(); emit('click', e, props.item); },
  onDblclick: (e: KonvaEventObject<MouseEvent>) => { e.evt.preventDefault(); emit('dblclick', e, props.item); },
  onDbltap: (e: KonvaEventObject<Event>) => { e.evt.preventDefault(); emit('dblclick', e, props.item); },
  onTransform: (e: KonvaEventObject<Event>) => emit('transform', e, props.item),
  onTransformend: (e: KonvaEventObject<Event>) => emit('transformend', e, props.item),
}));

onMounted(() => {
  node = (rectRef.value as any)?.getNode();
  if (node) {
    anim = new Konva.Animation(frame => {
      const dashOffset = (frame?.time || 0) / 100 % 100;
      node.dashOffset(-dashOffset);
    }, node.getLayer());
  }
});

watch(() => props.isDownstream, (isDownstream) => {
  if (isDownstream) {
    anim?.start();
  } else {
    anim?.stop();
    if (node) {
      node.dashOffset(0); // Reset dash offset when stopping
    }
  }
}, { immediate: false });

onBeforeUnmount(() => {
  anim?.stop();
});

const colorMap: Record<string, string> = {
  Command: '#3b82f6',   // Blue 500
  Event: '#f97316',     // Orange 500
  Aggregate: '#eab308', // Yellow 500
  Policy: '#ec4899',    // Pink 500
  ContextBox: '#f3f4f6', // Gray 100
  Actor: '#22c55e',      // Green 500
  ReadModel: '#10b981'  // Emerald 500
};

const stickyFont = "'Gowun Dodum', sans-serif";

</script>

<template>
  <v-group
    :config="groupConfig"
  >
    <v-rect ref="rectRef" :config="{
      width: item.width,
      height: item.height,
      fill: colorMap[item.type],
      stroke: isSelected || isDownstream ? highlightColor : (item.type === 'ContextBox' ? '#000000' : 'transparent'),
      strokeWidth: isSelected ? 4 / scale : isDownstream ? 3 / scale : (item.type === 'ContextBox' ? 1 / scale : 0),
      dash: isDownstream ? [20, 5] : [],
      cornerRadius: 8
    }" />
    <v-text :config="{ text: item.type, fontSize: 14 / scale, fontStyle: 'bold', width: item.width, y: 10, padding: 2, align: 'center', fontFamily: stickyFont }" />
    <v-text :config="{ text: item.instanceName, fontSize: 16 / scale, width: item.width, y: 30, padding: 2, align: 'center', fontFamily: stickyFont }" />
  </v-group>
</template>
