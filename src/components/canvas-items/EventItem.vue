<script setup lang="ts">
import { defineProps, defineEmits, ref, watch, onMounted, onBeforeUnmount, computed } from "vue";
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
  const node = (rectRef.value as any)?.getNode();
  if (node) {
    anim = new Konva.Animation(frame => {
      const dashOffset = (frame?.time || 0) / 100 % 100;
      node.dashOffset(-dashOffset);
    }, node.getLayer());
  }
  watch(() => props.isDownstream, (isDownstream) => {
    if (isDownstream) {
      anim?.start();
    } else {
      anim?.stop();
      node?.dashOffset(0); // Reset dash offset when stopping
    }
  }, { immediate: true });
});

onBeforeUnmount(() => {
  anim?.stop();
});

const colorMap: Record<string, string> = {
  Command: '#87ceeb',   // Sky Blue
  Event: '#ffb703',     // Orange
  Aggregate: '#ffff99', // Light Yellow
  Policy: '#ffc0cb',    // Pink
  ContextBox: '#fafaf8', // Light Gray
  Actor: '#d0f4de',      // Light Green
  ReadModel: '#90ee90'  // Light Green
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
      stroke: isSelected || isDownstream ? highlightColor : 'black',
      strokeWidth: isSelected ? 4 / scale : isDownstream ? 3 / scale : 2 / scale,
      dash: isDownstream ? [20, 5] : [],
      cornerRadius: 5
    }" />
    <v-text :config="{ text: item.type, fontSize: 14 / scale, fontStyle: 'bold', width: item.width, y: 10, padding: 2, align: 'center', fontFamily: stickyFont }" />
    <v-text :config="{ text: item.instanceName, fontSize: 16 / scale, width: item.width, y: 30, padding: 2, align: 'center', fontFamily: stickyFont }" />
  </v-group>
</template>
