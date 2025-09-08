<script setup lang="ts">
import { defineProps, computed } from "vue";
import type { CanvasItem } from "../../types";
import ObjectProperties from "./ObjectProperties.vue";

const props = defineProps<{
  item: CanvasItem;
}>();

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
  <v-group :config="{ x: item.x, y: item.y, draggable: true, name: 'item-' + item.id, rotation: item.rotation || 0, dragDistance: 10 }">
    <v-rect :config="{
      width: item.width,
      height: item.height,
      fill: item.type === 'Enum' ? '#e9ecef' : '#ffffff',
      stroke: 'black',
      strokeWidth: 2,
    }" />
    
    <!-- Stereotypes and Name -->
    <v-text v-if="item.stereotype" :config="{ text: `<<${item.stereotype}>>`, fontSize: 14, fontStyle: 'italic', width: item.width, y: stereotypeY, align: 'center' }" />
    <v-text v-if="item.type === 'Interface'" :config="{ text: '<<interface>>', fontSize: 14, fontStyle: 'italic', width: item.width, y: interfaceLabelY, align: 'center' }" />
    <v-text :config="{ text: item.instanceName, fontSize: 16, fontStyle: 'bold', width: item.width, y: nameY, align: 'center' }" />
    
    <!-- Separator Line -->
    <v-line v-if="item.type !== 'Package'" :config="{ points: [0, nameY + 20, item.width, nameY + 20], stroke: 'black', strokeWidth: 1 }" />

    <!-- Class/Interface Properties -->
    <template v-if="item.type === 'Class' || item.type === 'Interface'">
      <ObjectProperties :attributes="item.attributes" :methods="item.methods" :itemWidth="item.width" :yOffset="propertiesY" />
      <v-line :config="{ points: [0, propertiesY + (item.attributes?.length || 0) * 15 + 10, item.width, propertiesY + (item.attributes?.length || 0) * 15 + 10], stroke: 'black', strokeWidth: 1 }" />
    </template>

    <!-- Enum Properties -->
    <template v-if="item.type === 'Enum'">
        <v-text v-for="(val, index) in item.enumValues" :key="index" :config="{
            text: val,
            fontSize: 14,
            y: propertiesY + index * 15,
            width: item.width - 20,
            padding: 10,
            align: 'left'
        }" />
    </template>

  </v-group>
</template>
