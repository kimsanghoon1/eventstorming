<script setup lang="ts">
import { computed } from 'vue';
import type { CanvasItem, Connection } from '@/types';

type ViewportInfo = {
  width: number;
  height: number;
  scrollLeft: number;
  scrollTop: number;
  stageX: number;
  stageY: number;
  stageWidth: number;
  stageHeight: number;
  stageScale: number;
};

const props = defineProps<{
  items: CanvasItem[];
  connections: Connection[];
  stageWidth: number;
  stageHeight: number;
  viewport: ViewportInfo;
  scale: number;
}>();

const MAP_WIDTH = 220;
const MAP_HEIGHT = 160;

const colorMap: Record<string, string> = {
  Command: '#3b82f6',   // Blue 500
  Event: '#f97316',     // Orange 500
  Aggregate: '#eab308', // Yellow 500
  Policy: '#ec4899',    // Pink 500
  ContextBox: '#f3f4f6', // Gray 100
  Actor: '#22c55e',      // Green 500
  ReadModel: '#10b981',  // Emerald 500
  Class: '#90caf9',
  Interface: '#ce93d8',
  Enum: '#a5d6a7',
};

const overviewData = computed(() => {
  const stageWidth = Math.max(props.stageWidth || 1, 1);
  const stageHeight = Math.max(props.stageHeight || 1, 1);
  const factor = Math.min(MAP_WIDTH / stageWidth, MAP_HEIGHT / stageHeight);
  const offsetX = (MAP_WIDTH - stageWidth * factor) / 2;
  const offsetY = (MAP_HEIGHT - stageHeight * factor) / 2;

  const miniItems = (props.items ?? []).map((item) => ({
    id: item.id,
    type: item.type,
    x: offsetX + item.x * factor,
    y: offsetY + item.y * factor,
    width: Math.max(item.width ?? 0, 1) * factor,
    height: Math.max(item.height ?? 0, 1) * factor,
    color: colorMap[item.type] ?? '#9e9e9e',
    isContext: item.type === 'ContextBox',
  }));

  const itemLookup = new Map(miniItems.map((item) => [item.id, item]));
  const miniConnections = (props.connections ?? [])
    .map((conn) => {
      const from = itemLookup.get(conn.from);
      const to = itemLookup.get(conn.to);
      if (!from || !to) return null;
      return {
        id: conn.id,
        points: [
          from.x + from.width / 2,
          from.y + from.height / 2,
          to.x + to.width / 2,
          to.y + to.height / 2,
        ],
      };
    })
    .filter((value): value is { id: string; points: number[] } => value !== null);

  const safeScale = props.viewport?.stageScale || props.scale || 1;
  const viewportStageWidth = props.viewport?.stageWidth ?? ((props.viewport?.width || 0) / safeScale);
  const viewportStageHeight = props.viewport?.stageHeight ?? ((props.viewport?.height || 0) / safeScale);
  const viewportStageX = props.viewport?.stageX ?? ((props.viewport?.scrollLeft || 0) / safeScale);
  const viewportStageY = props.viewport?.stageY ?? ((props.viewport?.scrollTop || 0) / safeScale);

  const viewportRect =
    viewportStageWidth > 0 && viewportStageHeight > 0
      ? {
          x: offsetX + viewportStageX * factor,
          y: offsetY + viewportStageY * factor,
          width: viewportStageWidth * factor,
          height: viewportStageHeight * factor,
        }
      : null;

  return {
    items: miniItems,
    connections: miniConnections,
    viewportRect,
  };
});
</script>

<template>
  <div class="mini-map-container bg-white dark:bg-[#283539] border border-gray-200 dark:border-gray-700 shadow-lg rounded-xl overflow-hidden">
    <v-stage :config="{ width: MAP_WIDTH, height: MAP_HEIGHT }">
      <v-layer>
        <v-rect
          :config="{
            x: 0,
            y: 0,
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            fill: 'transparent',
          }"
        />

        <v-line
          v-for="conn in overviewData.connections"
          :key="conn.id"
          :config="{
            points: conn.points,
            stroke: 'rgba(156, 163, 175, 0.5)', // Gray 400 with opacity
            strokeWidth: 1,
          }"
        />

        <v-rect
          v-for="item in overviewData.items"
          :key="item.id"
          :config="{
            x: item.x,
            y: item.y,
            width: Math.max(item.width, 2),
            height: Math.max(item.height, 2),
            fill: item.color,
            cornerRadius: 2,
            opacity: 0.8
          }"
        />

        <v-rect
          v-if="overviewData.viewportRect"
          :config="{
            x: overviewData.viewportRect.x,
            y: overviewData.viewportRect.y,
            width: overviewData.viewportRect.width,
            height: overviewData.viewportRect.height,
            stroke: '#3b82f6', // Blue 500
            strokeWidth: 2,
            fill: 'rgba(59, 130, 246, 0.1)',
            cornerRadius: 4
          }"
        />
      </v-layer>
    </v-stage>
  </div>
</template>

<style scoped>
.mini-map-container {
  width: 220px;
  height: 160px;
  pointer-events: none;
}
</style>
