<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import type { CanvasItem, Connection } from '../../types';
import { getOrthogonalPoints, getClosestPointOnRect } from '@/utils/canvas';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useStore } from '@/store';

const props = defineProps({
  connection: { type: Object as PropType<Connection>, required: true },
  fromItem: { type: Object as PropType<CanvasItem>, required: true },
  toItem: { type: Object as PropType<CanvasItem>, required: true },
  isSelected: { type: Boolean, default: false },
  isHighlighted: { type: Boolean, default: false },
  name: { type: String, default: '' },
});

const emit = defineEmits(['connection-click']);
const store = useStore();

const highlightColor = '#FF4500';
const selectionColor = '#007bff';

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

const points = computed(() => {
  const defaultPts = getOrthogonalPoints(props.fromItem, props.toItem);

  // If no manual points, use default
  if (!props.connection.points || props.connection.points.length === 0) {
    return defaultPts;
  }

  // Use manual points but always adjust endpoints to follow objects
  const pts = [...props.connection.points];
  const n = pts.length;

  // Snap start point to nearest edge based on second point direction
  const secondPoint = { x: pts[2], y: pts[3] };
  const startSnap = getClosestPointOnRect(props.fromItem, secondPoint);
  pts[0] = startSnap.x;
  pts[1] = startSnap.y;

  // Adjust first segment to maintain orthogonality
  if (Math.abs(pts[2] - pts[0]) < Math.abs(pts[3] - pts[1])) {
    // More vertical: keep X aligned
    pts[2] = startSnap.x;
  } else {
    // More horizontal: keep Y aligned
    pts[3] = startSnap.y;
  }

  // Snap end point to nearest edge based on second-to-last point direction
  const secondLastPoint = { x: pts[n - 4], y: pts[n - 3] };
  const endSnap = getClosestPointOnRect(props.toItem, secondLastPoint);
  pts[n - 2] = endSnap.x;
  pts[n - 1] = endSnap.y;

  // Adjust last segment to maintain orthogonality
  if (Math.abs(pts[n - 2] - pts[n - 4]) < Math.abs(pts[n - 1] - pts[n - 3])) {
    // More vertical: keep X aligned
    pts[n - 4] = endSnap.x;
  } else {
    // More horizontal: keep Y aligned
    pts[n - 3] = endSnap.y;
  }

  return pts;
});

const startPoint = computed(() => ({ x: points.value[0], y: points.value[1] }));
const endPoint = computed(() => ({ x: points.value[points.value.length - 2], y: points.value[points.value.length - 1] }));

const startAngle = computed(() => {
    if (points.value.length < 4) return 0;
    return Math.atan2(points.value[3] - points.value[1], points.value[2] - points.value[0]);
});

const diamondSize = 10;
const arrowSize = 10;

const diamondCenter = computed(() => ({
    x: startPoint.value.x + Math.cos(startAngle.value) * diamondSize,
    y: startPoint.value.y + Math.sin(startAngle.value) * diamondSize,
}));

const sourceLabelPos = computed(() => ({
    x: points.value[0] + Math.cos(startAngle.value + 0.5) * 20,
    y: points.value[1] + Math.sin(startAngle.value + 0.5) * 20
}));

const targetLabelPos = computed(() => {
    const n = points.value.length;
    if (n < 4) return { x: 0, y: 0 };
    const angle = Math.atan2(points.value[n-1] - points.value[n-3], points.value[n-2] - points.value[n-4]);
    return {
        x: endPoint.value.x - Math.cos(angle - 0.5) * 20,
        y: endPoint.value.y - Math.sin(angle - 0.5) * 20
    };
});

const segmentHandles = computed(() => {
    if (!props.isSelected) return [];
    const pts = points.value;
    const handles = [];
    for (let i = 0; i < pts.length - 2; i += 2) {
        const x1 = pts[i];
        const y1 = pts[i+1];
        const x2 = pts[i+2];
        const y2 = pts[i+3];
        const orientation = Math.abs(x1 - x2) < 1 ? 'vertical' : 'horizontal';
        handles.push({
            x: (x1 + x2) / 2,
            y: (y1 + y2) / 2,
            index: i / 2,
            orientation
        });
    }
    return handles;
});



const onSegmentDragMove = (e: KonvaEventObject<DragEvent>, handle: any) => {
    const newPoints = [...points.value];
    const idx = handle.index * 2;
    const pos = e.target.position();
    const n = newPoints.length;
    
    // Update segment based on orientation
    if (handle.orientation === 'horizontal') {
        newPoints[idx + 1] = pos.y;
        newPoints[idx + 3] = pos.y;
    } else {
        newPoints[idx] = pos.x;
        newPoints[idx + 2] = pos.x;
    }

    // Snap start point to nearest edge based on second point direction
    const secondPoint = { x: newPoints[2], y: newPoints[3] };
    const startSnap = getClosestPointOnRect(props.fromItem, secondPoint);
    newPoints[0] = startSnap.x;
    newPoints[1] = startSnap.y;

    // Adjust first segment to maintain orthogonality
    if (Math.abs(newPoints[2] - newPoints[0]) < 1) {
        // First segment is vertical, keep X aligned
        newPoints[2] = startSnap.x;
    } else if (Math.abs(newPoints[3] - newPoints[1]) < 1) {
        // First segment is horizontal, keep Y aligned
        newPoints[3] = startSnap.y;
    }

    // Snap end point to nearest edge based on second-to-last point direction
    const secondLastPoint = { x: newPoints[n - 4], y: newPoints[n - 3] };
    const endSnap = getClosestPointOnRect(props.toItem, secondLastPoint);
    newPoints[n - 2] = endSnap.x;
    newPoints[n - 1] = endSnap.y;

    // Adjust last segment to maintain orthogonality
    if (Math.abs(newPoints[n - 2] - newPoints[n - 4]) < 1) {
        // Last segment is vertical, keep X aligned
        newPoints[n - 4] = endSnap.x;
    } else if (Math.abs(newPoints[n - 1] - newPoints[n - 3]) < 1) {
        // Last segment is horizontal, keep Y aligned
        newPoints[n - 3] = endSnap.y;
    }

    store.updateConnection({ ...props.connection, points: newPoints });
};

const getSegmentHandleConfig = (handle: any) => ({
    x: handle.x,
    y: handle.y,
    radius: 6,
    fill: 'white',
    stroke: selectionColor,
    strokeWidth: 1,
    draggable: true,
    dragBoundFunc: function(pos: {x: number, y: number}) {
        if (handle.orientation === 'horizontal') {
            return { x: handle.x, y: pos.y };
        } else {
            return { x: pos.x, y: handle.y };
        }
    }
});

const setCursor = (e: KonvaEventObject<MouseEvent>, cursor: string) => {
    const stage = e.target.getStage();
    if (stage) {
        stage.container().style.cursor = cursor;
    }
};
</script>

<template>
    <v-group
      :config="{ name: props.name }"
      @click="(evt: KonvaEventObject<MouseEvent>) => emit('connection-click', evt, connection)"
      @tap="(evt: KonvaEventObject<MouseEvent>) => emit('connection-click', evt, connection)"
    >
        <!-- Generalization (Inheritance) -->
        <v-arrow v-if="connection.type === 'Generalization'" :config="{
            points: points,
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            hitStrokeWidth: 15,
            fill: 'white',
            pointerLength: arrowSize * 1.5,
            pointerWidth: arrowSize * 1.5,
        }" />

        <!-- Aggregation -->
        <v-group v-else-if="connection.type === 'Aggregation'">
            <v-line :config="{ points: points, stroke: strokeColor, strokeWidth: strokeWidth, hitStrokeWidth: 15 }" />
            <v-regular-polygon :config="{
                x: diamondCenter.x,
                y: diamondCenter.y,
                sides: 4,
                radius: diamondSize,
                fill: 'white',
                stroke: strokeColor,
                strokeWidth: 2,
                rotation: (startAngle * 180 / Math.PI) + 45,
            }" />
        </v-group>

        <!-- Composition -->
        <v-group v-else-if="connection.type === 'Composition'">
            <v-line :config="{ points: points, stroke: strokeColor, strokeWidth: strokeWidth, hitStrokeWidth: 15 }" />
            <v-regular-polygon :config="{
                x: diamondCenter.x,
                y: diamondCenter.y,
                sides: 4,
                radius: diamondSize,
                fill: 'black',
                stroke: strokeColor,
                strokeWidth: 2,
                rotation: (startAngle * 180 / Math.PI) + 45,
            }" />
        </v-group>

        <!-- Dependency -->
        <v-arrow v-else-if="connection.type === 'Dependency'" :config="{
            points: points,
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            hitStrokeWidth: 15,
            pointerLength: arrowSize,
            pointerWidth: arrowSize,
            dash: [10, 5],
            fill: strokeColor,
        }" />

        <!-- Association (Default) -->
        <v-arrow v-else :config="{
            points: points,
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            hitStrokeWidth: 15,
            pointerLength: arrowSize,
            pointerWidth: arrowSize,
            fill: strokeColor,
        }" />

        <!-- Multiplicity Labels -->
        <v-text v-if="connection.sourceMultiplicity" :config="{
            x: sourceLabelPos.x,
            y: sourceLabelPos.y,
            text: connection.sourceMultiplicity,
            fontSize: 14,
            fill: 'black'
        }" />
        <v-text v-if="connection.targetMultiplicity" :config="{
            x: targetLabelPos.x,
            y: targetLabelPos.y,
            text: connection.targetMultiplicity,
            fontSize: 14,
            fill: 'black'
        }" />

        <!-- Handles -->
        <template v-if="isSelected">
            <v-circle
                v-for="(handle, i) in segmentHandles"
                :key="`seg-${i}`"
                :config="getSegmentHandleConfig(handle)"
                @mouseenter="(e: any) => setCursor(e, handle.orientation === 'horizontal' ? 'row-resize' : 'col-resize')"
                @mouseleave="(e: any) => setCursor(e, 'default')"
                @dragmove="(e: any) => onSegmentDragMove(e, handle)"
                @dragend="(e: any) => onSegmentDragMove(e, handle)"
            />
        </template>
    </v-group>
</template>
```
