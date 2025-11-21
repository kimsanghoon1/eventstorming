<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import type { Connection } from "@/types";
import { useStore } from "@/store";
import { getOrthogonalPoints } from "@/utils/canvas";
import Konva from 'konva';

const props = defineProps<{
  connection: Connection;
  isHighlighted: boolean;
  isSelected: boolean;
}>();

const store = useStore();

const points = computed(() => {
  const fromNode = store.getItemById(props.connection.from);
  const toNode = store.getItemById(props.connection.to);

  if (!fromNode || !toNode) {
    return [0, 0, 0, 0];
  }

  return getOrthogonalPoints(fromNode, toNode);
});

const isPubSub = computed(() => {
  const fromNode = store.getItemById(props.connection.from);
  const toNode = store.getItemById(props.connection.to);
  if (!fromNode || !toNode) return false;
  return fromNode.type === 'Event' && toNode.type === 'Policy';
});

const isRequestResponse = computed(() => {
  const fromNode = store.getItemById(props.connection.from);
  const toNode = store.getItemById(props.connection.to);
  if (!fromNode || !toNode) return false;
  return fromNode.type === 'Event' && toNode.type === 'Command';
});

const highlightColor = '#FF4500';
const selectionColor = '#2563eb';

const pubGradient = ['#ffb703', 'ffb703'] as const;
const pubStroke = '#ffb703';
const reqForwardGradient = ['#ffb703', '#ffb703'] as const;
const reqForwardStroke = '#ffb703';
const reqBackwardGradient = ['#87ceeb', '#87ceeb'] as const;
const reqBackwardStroke = '#87ceeb';

const DATA_PATH =
  'M12 2C7.582 2 4 3.79 4 6v12c0 2.21 3.582 4 8 4s8-1.79 8-4V6c0-2.21-3.582-4-8-4zm0 2c3.866 0 6 .895 6 2s-2.134 2-6 2-6-.895-6-2 2.134-2 6-2zm6 4.91V12c0 1.105-2.134 2-6 2s-6-.895-6-2V8.91C8.02 9.515 9.9 10 12 10s3.98-.485 6-1.09zm0 4V16c0 1.105-2.134 2-6 2s-6-.895-6-2v-1.09C8.02 15.515 9.9 16 12 16s3.98-.485 6-1.09zm0 4V20c0 1.105-2.134 2-6 2s-6-.895-6-2v-1.09C8.02 19.515 9.9 20 12 20s3.98-.485 6-1.09z';
const DATA_ICON_OFFSET = 8;
const DATA_ICON_SCALE = 1.4;
const dataIconPath = DATA_PATH;
const applyGradient = (node: Konva.Path, colors: readonly [string, string]) => {
  node.fillLinearGradientStartPoint({ x: -DATA_ICON_OFFSET, y: 0 });
  node.fillLinearGradientEndPoint({ x: DATA_ICON_OFFSET, y: 0 });
  node.fillLinearGradientColorStops([0, colors[0], 1, colors[1]]);
};

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

const pubDataRef = ref<any>(null);
const reqDataRef = ref<any>(null);
let pubDataAnim: Konva.Animation | null = null;
let reqDataAnim: Konva.Animation | null = null;

const resolveNode = <T extends Konva.Node>(value: any): T | null => {
  return value?.getNode ? (value.getNode() as T) : null;
};

const hideMarkers = () => {
  const pubNode = resolveNode<Konva.Path>(pubDataRef.value);
  const reqNode = resolveNode<Konva.Path>(reqDataRef.value);
  pubNode?.visible(false);
  reqNode?.visible(false);
  pubNode?.getLayer()?.batchDraw();
  reqNode?.getLayer()?.batchDraw();
};

const stopAnimations = () => {
  pubDataAnim?.stop();
  reqDataAnim?.stop();
  pubDataAnim = null;
  reqDataAnim = null;
  hideMarkers();
};

const getPointAlongLine = (t: number, reverse = false) => {
  const pts = points.value;
  
  // Calculate total length by summing all segments
  let totalLength = 0;
  for (let i = 0; i < pts.length - 2; i += 2) {
    const dx = pts[i + 2] - pts[i];
    const dy = pts[i + 3] - pts[i + 1];
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  let targetLength = totalLength * t;
  if (reverse) {
    targetLength = totalLength * (1 - t);
  }

  // Find the segment and position along it
  let currentLength = 0;
  for (let i = 0; i < pts.length - 2; i += 2) {
    const x1 = pts[i];
    const y1 = pts[i + 1];
    const x2 = pts[i + 2];
    const y2 = pts[i + 3];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (currentLength + segmentLength >= targetLength) {
      const segmentT = segmentLength > 0 ? (targetLength - currentLength) / segmentLength : 0;
      return {
        x: x1 + dx * segmentT,
        y: y1 + dy * segmentT,
      };
    }
    currentLength += segmentLength;
  }

  // Fallback to end point
  return {
    x: pts[pts.length - 2],
    y: pts[pts.length - 1],
  };
};

const ANIMATION_DURATION = 2600;
const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

const setMarkerPosition = (node: Konva.Node | null | undefined, t: number, reverse = false) => {
  if (!node) return;
  const clamped = t % 1;
  const pos = getPointAlongLine(clamped, reverse);
  node.position(pos);
  
  // Log position updates occasionally
  if (Math.random() < 0.05) { // 5% of the time
    console.log('setMarkerPosition:', pos, 'visible:', node.visible());
  }
};

const startFlowAnimation = (
  node: Konva.Path | null | undefined,
  {
    duration,
    pingPong = false,
    initialDirection = 1 as 1 | -1,
    onDirectionChange,
  }: {
    duration: number;
    pingPong?: boolean;
    initialDirection?: 1 | -1;
    onDirectionChange?: (direction: 1 | -1) => void;
  }
) => {
  if (!node || !node.getLayer()) {
    console.log('startFlowAnimation: no node or layer', node, node?.getLayer());
    return null;
  }
  let direction: 1 | -1 = initialDirection;
  let progress = 0;
  let frameCount = 0;

  const applyDirection = () => {
    onDirectionChange?.(direction);
    setMarkerPosition(node, 0, direction < 0);
  };

  applyDirection();

  const anim = new Konva.Animation((frame) => {
    frameCount++;
    if (frameCount % 30 === 0) { // Log every 30 frames
      console.log('Animation frame update:', frameCount, 'progress:', progress);
    }
    if (!frame) return;
    progress += (frame.timeDiff ?? 0) / duration;
    if (progress >= 1) {
      progress = progress % 1;
      if (pingPong) {
        direction = (direction * -1) as 1 | -1;
        progress = 0;
        applyDirection();
        return;
      }
    }

    const eased = easeInOut(progress);
    setMarkerPosition(node, eased, direction < 0);
  }, node.getLayer());

  anim.start();
  console.log('Animation started, isRunning:', anim.isRunning());
  return anim;
};

const startPubAnimation = (node: Konva.Path | null | undefined) => {
  if (!node) return null;
  node.visible(true);
  return startFlowAnimation(node, {
    duration: ANIMATION_DURATION,
    onDirectionChange: () => {
      applyGradient(node, pubGradient);
      node.stroke(pubStroke);
    },
  });
};

const startRequestAnimation = (node: Konva.Path | null | undefined) => {
  if (!node) return null;
  node.visible(true);
  return startFlowAnimation(node, {
    duration: ANIMATION_DURATION,
    pingPong: true,
    onDirectionChange: (direction) => {
      if (direction > 0) {
        applyGradient(node, reqForwardGradient);
        node.stroke(reqForwardStroke);
      } else {
        applyGradient(node, reqBackwardGradient);
        node.stroke(reqBackwardStroke);
      }
    },
  });
};

let setupTimer: ReturnType<typeof setTimeout> | null = null;

const setupAnimations = async () => {
  console.log('setupAnimations called, isHighlighted:', props.isHighlighted);
  
  // Clear any pending setup
  if (setupTimer) {
    clearTimeout(setupTimer);
    setupTimer = null;
  }
  
  if (!props.isHighlighted) {
    // Delay stopping animations to avoid race conditions
    setupTimer = setTimeout(() => {
      stopAnimations();
      setupTimer = null;
    }, 50);
    return;
  }
  
  stopAnimations();
  await nextTick();
  requestAnimationFrame(() => {
    console.log('requestAnimationFrame, isPubSub:', isPubSub.value, 'isRequestResponse:', isRequestResponse.value);
    if (isPubSub.value) {
      const node = resolveNode<Konva.Path>(pubDataRef.value);
      console.log('pubDataRef node:', node);
      if (node) {
        pubDataAnim = startPubAnimation(node);
        console.log('pubDataAnim started:', pubDataAnim);
      }
    } else if (isRequestResponse.value) {
      const node = resolveNode<Konva.Path>(reqDataRef.value);
      console.log('reqDataRef node:', node);
      if (node) {
        reqDataAnim = startRequestAnimation(node);
        console.log('reqDataAnim started:', reqDataAnim);
      }
    }
  });
};

watch(
  () => [props.isHighlighted, isPubSub.value, isRequestResponse.value, points.value],
  () => setupAnimations(),
  { flush: 'post' }
);

onMounted(() => {
  setupAnimations();
});

onBeforeUnmount(() => {
  stopAnimations();
});

</script>

<template>
  <v-group>
    <v-arrow :config="{
      points: points,
      stroke: strokeColor,
      fill: strokeColor,
      strokeWidth: strokeWidth,
      hitStrokeWidth: 15,
      dash: isPubSub ? [10, 5] : [],
      pointerLength: 10,
      pointerWidth: 10,
      name: `conn-${connection.id}`,
    }" />
    <v-path
      v-if="isPubSub && isHighlighted"
      ref="pubDataRef"
      :config="{
        data: dataIconPath,
        fill: pubGradient[0],
        stroke: pubStroke,
        perfectDrawEnabled: false,
        listening: false,
        scaleX: DATA_ICON_SCALE,
        scaleY: DATA_ICON_SCALE,
        offsetX: DATA_ICON_OFFSET,
        offsetY: DATA_ICON_OFFSET,
      }"
    />
    <v-path
      v-if="isRequestResponse && isHighlighted"
      ref="reqDataRef"
      :config="{
        data: dataIconPath,
        fill: reqForwardGradient[0],
        stroke: reqForwardStroke,
        perfectDrawEnabled: false,
        listening: false,
        scaleX: DATA_ICON_SCALE,
        scaleY: DATA_ICON_SCALE,
        offsetX: DATA_ICON_OFFSET,
        offsetY: DATA_ICON_OFFSET,
      }"
    />
  </v-group>
</template>
