<template>
  <v-group :config="{ y: yOffset }">
    <v-text
      v-for="(prop, index) in properties"
      :key="index"
      :config="{
        text: `${prop.key}: ${prop.value}`,
        fontSize: 12,
        fontFamily: fontFamily,
        y: index * 15,
        width: itemWidth - 20,
        padding: 10,
        align: 'left'
      }"
    />
    <v-text
      v-for="(attr, index) in attributes"
      :key="index"
      :config="{
        text: formatAttribute(attr),
        fontSize: 14,
        fontFamily: fontFamily,
        y: (properties?.length || 0) * 15 + index * 15,
        width: itemWidth - 20,
        padding: 10,
        align: 'left'
      }"
    />
    <v-text
      v-for="(method, index) in methods"
      :key="index"
      :config="{
        text: formatOperation(method),
        fontSize: 14,
        fontFamily: fontFamily,
        y: (properties?.length || 0) * 15 + (attributes?.length || 0) * 15 + 25 + index * 15,
        width: itemWidth - 20,
        padding: 10,
        align: 'left'
      }"
    />
  </v-group>
</template>

<script setup lang="ts">
import { defineProps, PropType } from 'vue';
import type { Property, UmlAttribute, UmlOperation } from '../../types';

defineProps({
  properties: Array as PropType<Property[]|undefined>,
  attributes: Array as PropType<UmlAttribute[]|undefined>,
  methods: Array as PropType<UmlOperation[]|undefined>,
  itemWidth: { type: Number, default: 200 },
  yOffset: { type: Number, default: 50 },
  fontFamily: { type: String, default: 'sans-serif' },
});

const getVisibilitySymbol = (visibility: 'public' | 'private' | 'protected' | 'package'): string => {
  switch (visibility) {
    case 'public': return '+';
    case 'private': return '-';
    case 'protected': return '#';
    case 'package': return '~';
    default: return '';
  }
};

const formatAttribute = (attr: UmlAttribute): string => {
  return `${getVisibilitySymbol(attr.visibility)} ${attr.name}: ${attr.type}${attr.defaultValue ? ` = ${attr.defaultValue}` : ''}`;
};

const formatOperation = (op: UmlOperation): string => {
  const params = op.parameters?.map(p => `${p.name}: ${p.type}`).join(', ') || '';
  return `${getVisibilitySymbol(op.visibility)} ${op.name}(${params}): ${op.returnType}`;
};
</script>