<template>
  <v-group>
    <v-text
      v-for="(attr, index) in attributes"
      :key="index"
      :config="{
        text: attr,
        fontSize: 14,
        y: 45 + index * 15,
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
        y: 45 + (attributes?.length || 0) * 15 + 15 + 5 + index * 15,
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
  attributes: Array as () => Array<string>,
  methods: Array as () => Array<string>,
  itemWidth: { type: Number, default: 200 }
});
</script>