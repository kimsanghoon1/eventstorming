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
  ContextBox: '#b0bec5',
  Command: '#64b5f6',
  Event: '#ffb703',
  Aggregate: '#ffd54f',
  Policy: '#f48fb1',
  Actor: '#aed581',
  ReadModel: '#81c784',
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
    .filter((value): value is { id: string | number; points: number[] } => value !== null);

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
  <div class="mini-map-container">
    <v-stage :config="{ width: MAP_WIDTH, height: MAP_HEIGHT }">
      <v-layer>
        <v-rect
          :config="{
            x: 0,
            y: 0,
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            fill: '#f8f9fa',
            stroke: '#dfe3e6',
            strokeWidth: 1,
          }"
        />

        <v-line
          v-for="conn in overviewData.connections"
          :key="conn.id"
          :config="{
            points: conn.points,
            stroke: 'rgba(0, 0, 0, 0.35)',
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
            stroke: item.color,
            strokeWidth: item.isContext ? 2 : 1,
            fill: item.isContext ? 'rgba(176, 190, 197, 0.15)' : 'transparent',
          }"
        />

        <v-rect
          v-if="overviewData.viewportRect"
          :config="{
            x: overviewData.viewportRect.x,
            y: overviewData.viewportRect.y,
            width: overviewData.viewportRect.width,
            height: overviewData.viewportRect.height,
            stroke: '#00bcd4',
            strokeWidth: 2,
            fill: 'rgba(0, 188, 212, 0.15)',
          }"
        />
      </v-layer>
    </v-stage>
  </div>
</template>

<style scoped>
.mini-map-container {
  position: relative;
  width: 236px;
  height: 176px;
  padding: 8px;
  background-color: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.1);
  pointer-events: none;
  z-index: 5;
}
</style>

