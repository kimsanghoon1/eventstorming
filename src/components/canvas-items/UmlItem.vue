<script setup lang="ts">
import { defineProps } from "vue";
import type { CanvasItem } from "../../types";
import ObjectProperties from "./ObjectProperties.vue";

const props = defineProps<{
  item: CanvasItem;
}>();
</script>

<template>
  <v-group :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0, dragDistance: 10 }">
    <v-rect :config="{
      width: item.width,
      height: item.height,
      fill: '#ffffff',
      stroke: 'black',
      strokeWidth: 2,
    }" />
    <v-text v-if="item.type === 'Interface'" :config="{ text: '<<interface>>', fontSize: 14, fontStyle: 'italic', width: item.width, padding: 5, align: 'center' }" />
    <v-text :config="{ text: item.instanceName, fontSize: 16, fontStyle: 'bold', width: item.width, padding: item.type === 'Interface' ? 20 : 10, align: 'center' }" />
    
    <template v-if="item.type === 'Class'">
      <v-line :config="{ points: [0, 40, item.width, 40], stroke: 'black', strokeWidth: 1 }" />
      <ObjectProperties :attributes="item.attributes" :methods="item.methods" :itemWidth="item.width" />
      <v-line :config="{ points: [0, 40 + (item.attributes?.length || 0) * 15 + 15, item.width, 40 + (item.attributes?.length || 0) * 15 + 15], stroke: 'black', strokeWidth: 1 }" />
    </template>
    
    <template v-if="item.type === 'Component'">
      <v-text :config="{ text: item.instanceName, fontSize: 16, width: item.width, padding: 10, align: 'center' }" />
      <v-rect :config="{ x: item.width - 30, y: 5, width: 25, height: 20, fill: '#ffffff', stroke: 'black', strokeWidth: 1 }" />
      <v-rect :config="{ x: item.width - 35, y: 10, width: 10, height: 5, fill: '#ffffff', stroke: 'black', strokeWidth: 1 }" />
      <v-rect :config="{ x: item.width - 35, y: 20, width: 10, height: 5, fill: '#ffffff', stroke: 'black', strokeWidth: 1 }" />
    </template>

    <template v-if="item.type === 'Package'">
      <v-rect :config="{
        width: item.width,
        height: item.height,
        fill: '#ffffff',
        stroke: 'black',
        strokeWidth: 2,
      }" />
      <v-rect :config="{
        width: item.width / 3,
        height: 20,
        fill: '#ffffff',
        stroke: 'black',
        strokeWidth: 2,
      }" />
      <v-text :config="{ text: item.instanceName, fontSize: 16, width: item.width, padding: 30, align: 'center' }" />
    </template>

  </v-group>
</template>
