<script setup lang="ts">
import { defineProps } from "vue";
import type { CanvasItem } from "../../types";
import ObjectProperties from "./ObjectProperties.vue";

const props = defineProps<{
  item: CanvasItem;
  highlighted: boolean;
}>();

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
  <v-group :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0, dragDistance: 10 }">
        <v-rect :config="{
      width: item.width,
      height: item.height,
      fill: colorMap[item.type],
      stroke: highlighted ? '#007bff' : 'black',
      strokeWidth: 2,
      cornerRadius: 5
    }" />
    <v-text :config="{ text: item.type, fontSize: 14, fontStyle: 'bold', width: item.width, padding: 10, align: 'center', fontFamily: stickyFont }" />
    <v-text :config="{ text: item.instanceName, fontSize: 16, width: item.width, padding: 30, align: 'center', fontFamily: stickyFont }" />
    <ObjectProperties :properties="item.properties" :itemWidth="item.width" :fontFamily="stickyFont" />
  </v-group>
</template>
