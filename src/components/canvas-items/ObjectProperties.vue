<template>
  <v-group :config="{ y: yOffset }">
    <v-line
      v-for="(y, idx) in dividerYs"
      :key="`divider-${idx}`"
      :config="{
        points: [0, y, itemWidth, y],
        stroke: '#black',
        strokeWidth: 2,
      }"
    />

    <v-text
      v-for="(prop, index) in properties || []"
      :key="`prop-${index}`"
      :config="{
        text: formatProperty(prop),
        fontSize: 13 / props.scale,
        fontFamily: fontFamily,
        y: sectionOffsets.properties !== undefined ? sectionOffsets.properties + index * ROW_HEIGHT : -9999,
        x: 12,
        width: itemWidth - 24,
        padding: 2,
        align: 'left'
      }"
    />
    <v-text
      v-for="(attr, index) in attributes || []"
      :key="`attr-${index}`"
      :config="{
        text: formatAttribute(attr),
        fontSize: 13 / props.scale,
        fontFamily: fontFamily,
        y: sectionOffsets.attributes !== undefined ? sectionOffsets.attributes + index * ROW_HEIGHT : -9999,
        x: 12,
        width: itemWidth - 24,
        padding: 2,
        align: 'left'
      }"
    />
    <v-text
      v-for="(method, index) in methods || []"
      :key="`method-${index}`"
      :config="{
        text: formatOperation(method),
        fontSize: 13 / props.scale,
        fontFamily: fontFamily,
        y: sectionOffsets.methods !== undefined ? sectionOffsets.methods + index * ROW_HEIGHT : -9999,
        x: 12,
        width: itemWidth - 24,
        padding: 2,
        align: 'left'
      }"
    />
    <v-text
      v-for="(val, index) in enumValues || []"
      :key="`enum-${index}`"
      :config="{
        text: val,
        fontSize: 13 / props.scale,
        fontFamily: fontFamily,
        y: sectionOffsets.enumValues !== undefined ? sectionOffsets.enumValues + index * ROW_HEIGHT : -9999,
        x: 12,
        width: itemWidth - 24,
        padding: 2,
        align: 'left'
      }"
    />
  </v-group>
</template>

<script setup lang="ts">
import { computed, PropType } from 'vue';
import type { Property, UmlAttribute, UmlOperation } from '../../types';
import { UML_ROW_HEIGHT as ROW_HEIGHT, UML_SECTION_GAP } from '@/utils/uml';

type SectionType = 'properties' | 'attributes' | 'methods' | 'enumValues';

const props = defineProps({
  properties: Array as PropType<Property[] | undefined>,
  attributes: Array as PropType<UmlAttribute[] | undefined>,
  methods: Array as PropType<UmlOperation[] | undefined>,
  enumValues: Array as PropType<string[] | undefined>,
  itemWidth: { type: Number, default: 200 },
  yOffset: { type: Number, default: 50 },
  fontFamily: { type: String, default: 'sans-serif' },
  scale: { type: Number, default: 1 },
});

const getVisibilitySymbol = (visibility?: string): string => {
  switch (visibility) {
    case 'public':
      return '+';
    case 'private':
      return '-';
    case 'protected':
      return '#';
    case 'package':
      return '~';
    default:
      return '';
  }
};

const formatAttribute = (attr: UmlAttribute): string => {
  return `${getVisibilitySymbol(attr.visibility)} ${attr.name || 'attr'}: ${attr.type || 'any'}${
    attr.defaultValue ? ` = ${attr.defaultValue}` : ''
  }`.trim();
};

const formatOperation = (op: UmlOperation): string => {
  const params = op.parameters?.map(p => `${p.name}: ${p.type || 'any'}`).join(', ') || '';
  const returnType = op.returnType ? `: ${op.returnType}` : '';
  return `${getVisibilitySymbol(op.visibility)} ${op.name || 'method'}(${params})${returnType}`.trim();
};

const formatProperty = (prop: Property): string =>
  `${prop.key || 'key'}: ${prop.value ?? ''}`.trim();

const sections = computed(() => {
  const ordered: { type: SectionType; start: number; count: number }[] = [];
  let cursor = 0;

  const appendSection = (type: SectionType, count: number) => {
    if (!count) return;
    if (ordered.length) {
      cursor += UML_SECTION_GAP;
    }
    ordered.push({ type, start: cursor, count });
    cursor += count * ROW_HEIGHT;
  };

  appendSection('properties', props.properties?.length || 0);
  appendSection('attributes', props.attributes?.length || 0);
  appendSection('methods', props.methods?.length || 0);
  appendSection('enumValues', props.enumValues?.length || 0);

  return ordered;
});

const sectionOffsets = computed(() => {
  const offsets: Record<SectionType, number | undefined> = {
    properties: undefined,
    attributes: undefined,
    methods: undefined,
    enumValues: undefined,
  };
  sections.value.forEach(section => {
    offsets[section.type] = section.start;
  });
  return offsets;
});

const dividerYs = computed(() =>
  sections.value.slice(0, -1).map(section => section.start + section.count * ROW_HEIGHT + UML_SECTION_GAP / 2)
);
</script>