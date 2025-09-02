<template>
  <v-group>
    <v-text
      v-for="(prop, index) in properties"
      :key="index"
      :config="{
        text: `${prop.key}: ${prop.value}`,
        fontSize: 12,
        y: 50 + index * 15,
        width: itemWidth - 20,
        padding: 10,
        align: 'left'
      }"
    />
    <v-text
      v-for="(attr, index) in attributes"
      :key="index"
      :config="{
        text: attr,
        fontSize: 14,
        y: 45 + (properties?.length || 0) * 15 + index * 15,
        width: itemWidth - 20,
        padding: 10,
        align: 'left'
      }"
    />
    <v-text
      v-for="(method, index) in methods"
      :key="index"
      :config="{
        text: method,
        fontSize: 14,
        y: 75 + (properties?.length || 0) * 15 + (attributes?.length || 0) * 15 + index * 15,
        width: itemWidth - 20,
        padding: 10,
        align: 'left'
      }"
    />
  </v-group>
</template>

<script setup lang="ts">
import { defineProps } from 'vue';

defineProps({
  properties: Array as () => Array<{ key: string; value: string }>,
  attributes: Array as () => Array<string>,
  methods: Array as () => Array<string>,
  itemWidth: { type: Number, default: 200 }
});
</script>
