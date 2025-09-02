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
  </v-group>
</template>

<script setup lang="ts">
import { defineProps } from 'vue';

defineProps({
  properties: Array as () => Array<{ key: string; value: string }>,
  itemWidth: { type: Number, default: 200 }
});
</script>