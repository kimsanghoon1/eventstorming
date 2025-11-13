<script setup lang="ts">
import { defineProps, computed, defineEmits, ref, onMounted, watch, onBeforeUnmount } from "vue";
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
      node?.dashOffset(0); // Reset dash offset
    }
  }, { immediate: true });
});

onBeforeUnmount(() => {
  anim?.stop();
});

const umlFont = "'Gowun Dodum', sans-serif";

const stereotypeY = 5;

const interfaceLabelY = computed(() => {
    let y = 5;
    if (props.item.stereotype) y += 15;
    return y;
});

const nameY = computed(() => {
    let y = 10;
    if (props.item.stereotype) y += 15;
    if (props.item.type === 'Interface') y += 15;
    return y;
});

const propertiesY = computed(() => nameY.value + 25);

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
      fill: item.type === 'Enum' ? '#e9ecef' : '#ffffff',
      stroke: isSelected || isDownstream ? highlightColor : 'black',
      strokeWidth: isSelected ? 4 / scale : isDownstream ? 3 / scale : 2 / scale,
      dash: isDownstream ? [20, 5] : [],
    }" />
    
    <!-- Stereotypes and Name -->
    <v-text v-if="item.stereotype" :config="{ text: `<<${item.stereotype}>>`, fontSize: 14 / scale, fontStyle: 'italic', width: item.width, y: stereotypeY, align: 'center', fontFamily: umlFont, padding: 2 }" />
    <v-text v-if="item.type === 'Interface'" :config="{ text: '<<interface>>', fontSize: 14 / scale, fontStyle: 'italic', width: item.width, y: interfaceLabelY, align: 'center', fontFamily: umlFont, padding: 2 }" />
    <v-text :config="{ text: item.instanceName, fontSize: 16 / scale, fontStyle: 'bold', width: item.width, y: nameY, align: 'center', fontFamily: umlFont, padding: 2 }" />
    
    <!-- Separator Line -->
    <v-line v-if="item.type !== 'Package'" :config="{ points: [0, nameY + 20, item.width, nameY + 20], stroke: 'black', strokeWidth: 1 }" />

    <!-- Class/Interface Properties -->
    <template v-if="item.type === 'Class' || item.type === 'Interface'">
      <ObjectProperties :attributes="item.attributes" :methods="item.methods" :itemWidth="item.width" :yOffset="propertiesY" :fontFamily="umlFont" :scale="scale" />
      <v-line :config="{ points: [0, propertiesY + (item.attributes?.length || 0) * 15 + 10, item.width, propertiesY + (item.attributes?.length || 0) * 15 + 10], stroke: 'black', strokeWidth: 1 }" />
    </template>

    <!-- Enum Properties -->
    <template v-if="item.type === 'Enum'">
        <v-text v-for="(val, index) in item.enumValues" :key="index" :config="{
            text: val,
            fontSize: 14 / scale,
            y: propertiesY + index * 15,
            x: 10,
            width: item.width - 20,
            align: 'left',
            fontFamily: umlFont,
            padding: 2
        }" />
    </template>

  </v-group>
</template>