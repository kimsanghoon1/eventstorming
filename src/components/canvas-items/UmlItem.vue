<script setup lang="ts">
import { computed, ref, onMounted, watch, onBeforeUnmount } from "vue";
import type { CanvasItem } from "../../types";
import type { KonvaEventObject } from "konva/lib/Node";
import Konva from 'konva';
import ObjectPropertiesDisplay from './ObjectProperties.vue';
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
const highlightColor = '#60a5fa'; // Light Blue for downstream/highlight
const selectionColor = '#2563eb'; // Royal Blue for selection
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


// onMounted(() => {
//   const node = (rectRef.value as any)?.getNode();
//   if (node) {
//     anim = new Konva.Animation(frame => {
//       const dashOffset = (frame?.time || 0) / 100 % 100;
//       node.dashOffset(-dashOffset);
//     }, node.getLayer());
//   }
//   watch(() => props.isDownstream, (isDownstream) => {
//     if (isDownstream) {
//       anim?.start();
//     } else {
//       anim?.stop();
//       node?.dashOffset(0); // Reset dash offset
//     }
//   }, { immediate: true });
// });

// onBeforeUnmount(() => {
//   anim?.stop();
// });

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

const propertiesY = computed(() => nameY.value + 35);
const hasDetailSection = computed(() => {
  const { properties, attributes, methods, enumValues } = props.item;
  return Boolean(
    (properties && properties.length) ||
    (attributes && attributes.length) ||
    (methods && methods.length) ||
    (enumValues && enumValues.length)
  );
});

</script>
  
<template>
  <v-group
    :config="groupConfig"
  >
    <v-rect ref="rectRef" :config="{
      width: item.width,
      height: item.height,
      fill: item.type === 'Enum' ? '#e9ecef' : '#ffffff',
      stroke: isSelected ? selectionColor : (isDownstream ? highlightColor : 'black'),
      strokeWidth: isSelected ? 4 / scale : (isDownstream ? 3 / scale : 2 / scale),
      dash: [],
      shadowColor: changeShadowColor || undefined,
      shadowBlur: changeShadowColor ? 25 : 0,
      shadowOpacity: changeShadowColor ? 0.8 : 0,
    }" />
    
    <!-- Stereotypes and Name -->
    <v-text v-if="item.stereotype" :config="{ text: `<<${item.stereotype}>>`, fontSize: 14 / scale, fontStyle: 'italic', width: item.width, y: stereotypeY, align: 'center', fontFamily: umlFont, padding: 2 }" />
    <v-text v-if="item.type === 'Interface'" :config="{ text: '<<interface>>', fontSize: 14 / scale, fontStyle: 'italic', width: item.width, y: interfaceLabelY, align: 'center', fontFamily: umlFont, padding: 2 }" />
    <v-text :config="{ text: item.instanceName, fontSize: 16 / scale, fontStyle: 'bold', width: item.width, y: nameY, align: 'center', fontFamily: umlFont, padding: 2 }" />
    
    <!-- Separator Line -->
    <v-line v-if="item.type !== 'Package'" :config="{ points: [0, nameY + 30, item.width, nameY + 30], stroke: 'black', strokeWidth: 2 }"  />

    <ObjectPropertiesDisplay
      v-if="hasDetailSection"
      :properties="item.properties"
      :attributes="item.attributes"
      :methods="item.methods"
      :enum-values="item.enumValues"
      :item-width="item.width"
      :y-offset="propertiesY"
      :font-family="umlFont"
      :scale="scale"
    />
  </v-group>
</template>