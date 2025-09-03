<script setup lang="ts">
import { computed, defineProps, PropType } from 'vue';
import type { CanvasItem, Connection } from '../../types';

const props = defineProps({
  connection: { type: Object as PropType<Connection>, required: true },
  fromItem: { type: Object as PropType<CanvasItem>, required: true },
  toItem: { type: Object as PropType<CanvasItem>, required: true },
});

const getEdgePoint = (source: CanvasItem, target: CanvasItem) => {
    const sx = source.x + source.width / 2;
    const sy = source.y + source.height / 2;
    const tx = target.x + target.width / 2;
    const ty = target.y + target.height / 2;

    const dx = tx - sx;
    const dy = ty - sy;

    const angle = Math.atan2(dy, dx);

    const halfW = source.width / 2;
    const halfH = source.height / 2;

    const tan = Math.tan(angle);
    const region = (angle > -Math.PI / 4 && angle <= Math.PI / 4) ? 1 :
                   (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) ? 2 :
                   (angle > 3 * Math.PI / 4 || angle <= -3 * Math.PI / 4) ? 3 : 4;

    let x, y;
    switch (region) {
        case 1: x = sx + halfW; y = sy + halfW * tan; break;
        case 2: x = sx + halfH / tan; y = sy + halfH; break;
        case 3: x = sx - halfW; y = sy - halfW * tan; break;
        case 4: x = sx - halfH / tan; y = sy - halfH; break;
    }
    return { x, y };
};

const fromPos = computed(() => getEdgePoint(props.fromItem, props.toItem));
const toPos = computed(() => getEdgePoint(props.toItem, props.fromItem));

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
    <v-group>
        <!-- Generalization (Inheritance) -->
        <v-arrow v-if="connection.type === 'Generalization'" :config="{
            points: [fromPos.x, fromPos.y, toPos.x, toPos.y],
            stroke: 'black',
            strokeWidth: 2,
            fill: 'white',
            pointerLength: arrowSize * 1.5,
            pointerWidth: arrowSize * 1.5,
        }" />

        <!-- Aggregation -->
        <v-group v-else-if="connection.type === 'Aggregation'">
            <v-line :config="{ points: [diamondPos.x, diamondPos.y, toPos.x, toPos.y], stroke: 'black', strokeWidth: 2 }" />
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
            <v-line :config="{ points: [diamondPos.x, diamondPos.y, toPos.x, toPos.y], stroke: 'black', strokeWidth: 2 }" />
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

        <!-- Association (Default) -->
        <v-arrow v-else :config="{
            points: [fromPos.x, fromPos.y, toPos.x, toPos.y],
            stroke: 'black',
            strokeWidth: 2,
            pointerLength: arrowSize,
            pointerWidth: arrowSize,
        }" />
    </v-group>
</template>
