<script setup lang="ts">
import { defineProps, defineEmits, ref, watch, onMounted, onBeforeUnmount } from "vue";
import type { CanvasItem } from "../../types";
import ObjectProperties from "./ObjectProperties.vue";
import type { KonvaEventObject } from "konva/lib/Node";
import Konva from 'konva';

const props = defineProps<{
  item: CanvasItem;
  isSelected: boolean;
  isDownstream: boolean;
  scale: number;
}>();

const emit = defineEmits(['click', 'dblclick']);

const rectRef = ref(null);
let anim: Konva.Animation | null = null;
const highlightColor = '#FF4500'; // OrangeRed for high visibility

const handleClick = (e: KonvaEventObject<MouseEvent>) => {
  e.evt.preventDefault();
  emit('item-click', props.item.id);
};

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
  ContextBox: '#e9ecef', // Light Gray
  Actor: '#d0f4de',      // Light Green
  ReadModel: '#90ee90'  // Light Green
};

const stickyFont = "'Gowun Dodum', sans-serif";

</script>

<template>
  <v-group 
    :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0, dragDistance: 10 }" 
    @click="(e: KonvaEventObject) => { e.evt.preventDefault(); emit('click', e); }" 
    @tap="(e: KonvaEventObject) => { e.evt.preventDefault(); emit('click', e); }"
    @dblclick="(e: KonvaEventObject) => { e.evt.preventDefault(); emit('dblclick', e); }"
    @dbltap="(e: KonvaEventObject) => { e.evt.preventDefault(); emit('dblclick', e); }"
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
    <ObjectProperties :properties="item.properties" :itemWidth="item.width" :fontFamily="stickyFont" :scale="scale" />
  </v-group>
</template>
