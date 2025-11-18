<script setup lang="ts">
import { computed, defineProps, PropType } from 'vue';
import type { CanvasItem, Connection } from '../../types';

const props = defineProps({
  connection: { type: Object as PropType<Connection>, required: true },
  fromItem: { type: Object as PropType<CanvasItem>, required: true },
  toItem: { type: Object as PropType<CanvasItem>, required: true },
  isSelected: { type: Boolean, default: false },
  isHighlighted: { type: Boolean, default: false },
  name: { type: String, default: '' },
});

const emit = defineEmits(['connection-click']);

const highlightColor = '#FF4500'; // OrangeRed for high visibility
const selectionColor = '#007bff'; // Blue for selection

const strokeColor = computed(() => {
  if (props.isSelected) return selectionColor;
  if (props.isHighlighted) return highlightColor;
  return 'black';
});
const strokeWidth = computed(() => {
  if (props.isSelected) return 4;
  if (props.isHighlighted) return 3;
  return 2;
});

const getEdgePoint = (source: CanvasItem, target: CanvasItem) => {
    const sx = source.x;
    const sy = source.y;
    const sw = source.width;
    const sh = source.height;
    const tx = target.x;
    const ty = target.y;
    const tw = target.width;
    const th = target.height;

    const sourceCenter = { x: sx + sw / 2, y: sy + sh / 2 };
    const targetCenter = { x: tx + tw / 2, y: ty + th / 2 };

    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    const angle = Math.atan2(dy, dx);

    if (angle > -Math.PI / 4 && angle <= Math.PI / 4) { // Right
        return { x: sx + sw, y: sourceCenter.y };
    } else if (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) { // Bottom
        return { x: sourceCenter.x, y: sy + sh };
    } else if (angle > 3 * Math.PI / 4 || angle <= -3 * Math.PI / 4) { // Left
        return { x: sx, y: sourceCenter.y };
    } else { // Top
        return { x: sourceCenter.x, y: sy };
    }
};

const safeFromItem = computed(() => props.fromItem ?? null);
const safeToItem = computed(() => props.toItem ?? null);

const fromPos = computed(() => {
  if (!safeFromItem.value || !safeToItem.value) {
    return { x: 0, y: 0 };
  }
  return getEdgePoint(safeFromItem.value, safeToItem.value);
});
const toPos = computed(() => {
  if (!safeFromItem.value || !safeToItem.value) {
    return { x: 0, y: 0 };
  }
  return getEdgePoint(safeToItem.value, safeFromItem.value);
});

const angle = computed(() => Math.atan2(toPos.value.y - fromPos.value.y, toPos.value.x - fromPos.value.x));

const diamondSize = 10;
const arrowSize = 10;

// Position for Aggregation/Composition diamond
const diamondPos = computed(() => ({
    x: fromPos.value.x + Math.cos(angle.value) * (diamondSize / Math.sqrt(2)),
    y: fromPos.value.y + Math.sin(angle.value) * (diamondSize / Math.sqrt(2)),
}));

</script>

<template>
    <v-group
      :config="{ name: props.name }"
      @click="(evt) => emit('connection-click', evt, connection)"
      @tap="(evt) => emit('connection-click', evt, connection)"
    >
        <!-- Generalization (Inheritance) -->
        <v-arrow v-if="connection.type === 'Generalization'" :config="{
            points: [fromPos.x, fromPos.y, toPos.x, toPos.y],
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            hitStrokeWidth: 15,
            fill: 'white',
            pointerLength: arrowSize * 1.5,
            pointerWidth: arrowSize * 1.5,
        }" />

        <!-- Aggregation -->
        <v-group v-else-if="connection.type === 'Aggregation'">
            <v-line :config="{ points: [diamondPos.x, diamondPos.y, toPos.x, toPos.y], stroke: strokeColor, strokeWidth: strokeWidth, hitStrokeWidth: 15 }" />
            <v-regular-polygon :config="{
                x: fromPos.x,
                y: fromPos.y,
                sides: 4,
                radius: diamondSize,
                fill: 'white',
                stroke: 'black',
                strokeWidth: 2,
                rotation: (angle * 180 / Math.PI) + 45,
            }" />
        </v-group>

        <!-- Composition -->
        <v-group v-else-if="connection.type === 'Composition'">
            <v-line :config="{ points: [diamondPos.x, diamondPos.y, toPos.x, toPos.y], stroke: strokeColor, strokeWidth: strokeWidth, hitStrokeWidth: 15 }" />
            <v-regular-polygon :config="{
                x: fromPos.x,
                y: fromPos.y,
                sides: 4,
                radius: diamondSize,
                fill: 'black',
                stroke: 'black',
                strokeWidth: 2,
                rotation: (angle * 180 / Math.PI) + 45,
            }" />
        </v-group>

        <!-- Dependency -->
        <v-arrow v-else-if="connection.type === 'Dependency'" :config="{
            points: [fromPos.x, fromPos.y, toPos.x, toPos.y],
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            hitStrokeWidth: 15,
            pointerLength: arrowSize,
            pointerWidth: arrowSize,
            dash: [10, 5],
        }" />

        <!-- Association (Default) -->
        <v-arrow v-else :config="{
            points: [fromPos.x, fromPos.y, toPos.x, toPos.y],
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            hitStrokeWidth: 15,
            pointerLength: arrowSize,
            pointerWidth: arrowSize,
        }" />

        <!-- Multiplicity Labels -->
        <v-text :config="{
            x: fromPos.x + Math.cos(angle + 0.2) * 15 - 10,
            y: fromPos.y + Math.sin(angle + 0.2) * 15 - 10,
            text: connection.sourceMultiplicity,
            fontSize: 14,
        }" />
        <v-text :config="{
            x: toPos.x - Math.cos(angle - 0.2) * 35 - 10,
            y: toPos.y - Math.sin(angle - 0.2) * 35 - 10,
            text: connection.targetMultiplicity,
            fontSize: 14,
        }" />
    </v-group>
</template>
