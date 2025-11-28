import { ref, onMounted, onBeforeUnmount, watch, type Ref } from 'vue';
import Konva from 'konva';
import { store } from '../store';
import type { CanvasItem, Connection } from '../types';
import { getEdgePoint } from '../utils/canvas';
import { ensureCanvasItemDimensions } from '@/utils/uml';

// Helper to get pointer position respecting stage's scale and position
const getTransformedPointerPosition = (stage: Konva.Stage | null) => {
  if (!stage) return null;
  const pointerPosition = stage.getPointerPosition();
  if (!pointerPosition) return null;

  const transform = stage.getAbsoluteTransform().copy();
  transform.invert();
  return transform.point(pointerPosition);
};

export function useCanvasLogic(
  externalStageRef?: Ref<{ getStage: () => Konva.Stage } | null>
) {
  const selectedItems = ref<CanvasItem[]>([]);
  const selectedConnections = ref<Connection[]>([]);
  const stageRef =
    externalStageRef ?? ref<{ getStage: () => Konva.Stage } | null>(null);
  const transformerRef = ref<{ getNode: () => Konva.Transformer } | null>(null);
  const selectionRectRef = ref<{ getNode: () => Konva.Rect } | null>(null);
  const selection = ref({
    visible: false,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
  });

  const connectionMode = ref<{ active: boolean; type: string | null; from: number | null }>({ active: false, type: null, from: null });
  const isHandToolActive = ref(false); // To toggle between pan and select

  const stageConfig = ref({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  watch(stageRef, (stage) => {
    if (stage) {
      store.setActiveStage(stage.getStage());
    }
  }, { immediate: true });

  const updateStageSize = () => {
    const items = store.reactiveItems ?? [];
    const padding = 200;
    const wrapper = document.querySelector('.canvas-wrapper');
    const viewportWidth = wrapper ? wrapper.clientWidth : window.innerWidth;
    const viewportHeight = wrapper ? wrapper.clientHeight : window.innerHeight;

    if (items.length === 0) {
      stageConfig.value = {
        width: viewportWidth,
        height: viewportHeight,
      };
      return;
    }

    let maxX = 0;
    let maxY = 0;

    items.forEach(item => {
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    });

    stageConfig.value = {
      width: Math.max(maxX + padding, viewportWidth),
      height: Math.max(maxY + padding, viewportHeight),
    };
  };

  watch(() => store.reactiveItems.length, updateStageSize);

  const startConnection = (type: string) => {
    const fromId = selectedItems.value.length === 1 ? selectedItems.value[0].id : null;
    connectionMode.value = { active: true, type: type, from: fromId };

    if (stageRef.value) {
      stageRef.value.getStage().container().style.cursor = 'crosshair';
    }
  };

  const cancelConnectionMode = () => {
    connectionMode.value = { active: false, type: null, from: null };
    if (stageRef.value) {
      stageRef.value.getStage().container().style.cursor = 'default';
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
      return;
    }

    if (e.key === 'h') {
      isHandToolActive.value = !isHandToolActive.value;
      const stage = stageRef.value?.getStage();
      if (stage) {
        stage.draggable(isHandToolActive.value);
        stage.container().style.cursor = isHandToolActive.value ? 'grab' : 'default';
      }
    }
    if (e.key === 'Escape') {
      if (connectionMode.value.active) {
        cancelConnectionMode();
      } else {
        selectedItems.value = [];
        selectedConnections.value = [];
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      selectedItems.value = store.reactiveItems;
      selectedConnections.value = [];
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      store.undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      store.redo();
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const itemIdsToDelete = selectedItems.value.map(item => item.id);
      if (itemIdsToDelete.length > 0) {
        store.deleteItemsAndAttachedConnections(itemIdsToDelete);
        selectedItems.value = [];
      }
      const connIdsToDelete = selectedConnections.value.map(conn => conn.id);
      if (connIdsToDelete.length > 0) {
        store.deleteConnections(connIdsToDelete);
        selectedConnections.value = [];
      }
    }
  };

  onMounted(() => {
    updateStageSize();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateStageSize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('resize', updateStageSize);
  });

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Prevent selection logic when hand tool is active
    if (isHandToolActive.value || e.target !== e.target.getStage() || connectionMode.value.active) {
      if (isHandToolActive.value) {
        const stage = stageRef.value?.getStage();
        if (stage) {
          stage.container().style.cursor = 'grabbing';
        }
      }
      return;
    }
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getTransformedPointerPosition(stage);
    if (!pos) return;
    selection.value = {
      visible: true,
      x1: pos.x,
      y1: pos.y,
      x2: pos.x,
      y2: pos.y,
    };
    if (!e.evt.ctrlKey && !e.evt.metaKey) {
      selectedItems.value = [];
      selectedConnections.value = [];
    }
    // Clear properties panel on stage click
    if (e.target === e.target.getStage()) {
      store.setSelectedItem(null);
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isHandToolActive.value || !selection.value.visible) {
      return;
    }
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getTransformedPointerPosition(stage);
    if (!pos) return;
    selection.value.x2 = pos.x;
    selection.value.y2 = pos.y;
  };

  const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isHandToolActive.value) {
      const stage = stageRef.value?.getStage();
      if (stage) {
        stage.container().style.cursor = 'grab';
      }
    }
    if (isHandToolActive.value || !selection.value.visible) {
      return;
    }
    e.evt.preventDefault();
    setTimeout(() => {
      selection.value.visible = false;
    }, 0);

    if (!stageRef.value || !selectionRectRef.value) return;
    const stage = stageRef.value.getStage();
    const box = selectionRectRef.value.getNode().getClientRect();
    const newlySelected: CanvasItem[] = [];
    store.reactiveItems.forEach((item) => {
      const node = stage.findOne('.item-' + item.id);
      if (node) {
        const nodeBox = node.getClientRect();
        if (Konva.Util.haveIntersection(box, nodeBox)) {
          newlySelected.push(item);
        }
      }
    });
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const currentIds = new Set(selectedItems.value.map(i => i.id));
      newlySelected.forEach(item => {
        if (!currentIds.has(item.id)) {
          selectedItems.value.push(item);
        }
      });
    } else {
      selectedItems.value = newlySelected;
    }
  };

  const handleItemClick = (e: Konva.KonvaEventObject<MouseEvent>, item: CanvasItem) => {
    if (connectionMode.value.active && connectionMode.value.type) {
      if (connectionMode.value.from === null) {
        // This case is for starting a connection from the toolbox button
        if (item.type === 'Aggregate') {
          alert("Connections cannot originate from an Aggregate.");
          cancelConnectionMode();
          return;
        }
        connectionMode.value.from = item.id;
      } else {
        // This case is for completing a connection
        if (item.type === 'Aggregate') {
          alert("Connections cannot target an Aggregate.");
          cancelConnectionMode();
          return;
        }
        if (connectionMode.value.from !== item.id) {
          store.addConnection({
            from: connectionMode.value.from,
            to: item.id,
            type: connectionMode.value.type,
            sourceMultiplicity: '1',
            targetMultiplicity: '1',
          });
        }
        cancelConnectionMode();
      }
    } else {
      const isCtrlPressed = e.evt.ctrlKey || e.evt.metaKey;
      const isItemAlreadySelected = selectedItems.value.some(i => i.id === item.id);
      selectedConnections.value = [];

      if (!isCtrlPressed) {
        if (isItemAlreadySelected && selectedItems.value.length === 1) {
          return;
        }
        selectedItems.value = [item];
      } else {
        if (isItemAlreadySelected) {
          selectedItems.value = selectedItems.value.filter(i => i.id !== item.id);
        } else {
          selectedItems.value.push(item);
        }
      }
    }
  };

  const scheduleTransformerRefresh = (() => {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        updateTransformer();
        const transformerNode = transformerRef.value?.getNode();
        transformerNode?.forceUpdate?.();
        const layer = transformerNode ? transformerNode.getLayer() : null;
        if (layer && typeof (layer as any).batchDraw === 'function') {
          (layer as any).batchDraw();
        }
      });
    };
  })();

  const resizeNodeAndPersist = (node: Konva.Node, item: CanvasItem) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    if (scaleX === 1 && scaleY === 1) return;

    const nextItem = ensureCanvasItemDimensions({
      ...item,
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width: Math.max(5, item.width * scaleX),
      height: Math.max(5, item.height * scaleY),
    });

    node.scaleX(1);
    node.scaleY(1);
    node.size({ width: nextItem.width, height: nextItem.height });
    store.updateItem(nextItem);
    scheduleTransformerRefresh();
  };

  const handleItemTransform = (e: Konva.KonvaEventObject<Event>, item: CanvasItem) => {
    const node = e.target;
    if (!node) return;
    resizeNodeAndPersist(node, item);
  };

  const handleItemDblClick = (e: Konva.KonvaEventObject<MouseEvent>, item: CanvasItem) => {
    console.log('handleItemDblClick triggered in useCanvasLogic for item:', item);
    store.setSelectedItem(item);
  };

  const handleConnectionClick = (e: Konva.KonvaEventObject<MouseEvent>, conn: Connection) => {
    e.evt.preventDefault();
    const isCtrlPressed = e.evt.ctrlKey || e.evt.metaKey;
    const isConnAlreadySelected = selectedConnections.value.some(c => c.id === conn.id);
    selectedItems.value = [];

    if (!isCtrlPressed) {
      if (isConnAlreadySelected && selectedConnections.value.length === 1) {
        return;
      }
      selectedConnections.value = [conn];
    } else {
      if (isConnAlreadySelected) {
        selectedConnections.value = selectedConnections.value.filter(c => c.id !== conn.id);
      } else {
        selectedConnections.value.push(conn);
      }
    }

    // Update the store for the properties panel
    store.setSelectedItem(null); // Or you can have properties for connections too
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    if (!transformerRef.value) return;
    const transformer = transformerRef.value.getNode();
    const nodes = (e.target as any) === transformer ? transformer.nodes() : [e.target];

    nodes.forEach((node: Konva.Node) => {
      const id = Number(node.name().split('-')[1]);
      const baseItem = store.reactiveItems.find(item => item.id === id);
      if (!baseItem) return;
      resizeNodeAndPersist(node, baseItem);
    });
    updateStageSize();
  };

  const updateTransformer = () => {
    if (!transformerRef.value || !stageRef.value) return;
    const transformerNode = transformerRef.value.getNode();
    const stage = stageRef.value.getStage();

    const selectedNodes = selectedItems.value.map(item => {
      return stage.findOne('.item-' + item.id);
    }).filter((n): n is Konva.Node => !!n);

    transformerNode.nodes(selectedNodes);
    const layer = transformerNode.getLayer();
    if (layer && typeof (layer as any).batchDraw === 'function') {
      (layer as any).batchDraw();
    }
  };

  const dragState = {
    positions: new Map<string, { x: number; y: number }>(),
  };

  const updateConnectionsDuringDrag = (stage: Konva.Stage) => {
    if (!dragState.positions.size) {
      return;
    }
    const connectionsToUpdate = store.reactiveConnections.filter(
      conn =>
        dragState.positions.has(conn.from) || dragState.positions.has(conn.to)
    );
    let layer: Konva.Layer | null = null;
    connectionsToUpdate.forEach(conn => {
      const arrow = stage.findOne(`.conn-${conn.id}`) as Konva.Arrow | null;
      if (!arrow) {
        return;
      }
      if (!layer) {
        layer = arrow.getLayer();
      }
      const fromNode = stage.findOne(`.item-${conn.from}`) as Konva.Node | null;
      const toNode = stage.findOne(`.item-${conn.to}`) as Konva.Node | null;
      const fromItem = store.getItemById(conn.from);
      const toItem = store.getItemById(conn.to);
      if (!fromNode || !toNode || !fromItem || !toItem) {
        return;
      }
      const fromPoint = getEdgePoint(
        { ...fromItem, x: fromNode.x(), y: fromNode.y() },
        { ...toItem, x: toNode.x(), y: toNode.y() }
      );
      const toPoint = getEdgePoint(
        { ...toItem, x: toNode.x(), y: toNode.y() },
        { ...fromItem, x: fromNode.x(), y: fromNode.y() }
      );
      arrow.points([fromPoint.x, fromPoint.y, toPoint.x, toPoint.y]);
    });
    if (layer && typeof (layer as any).batchDraw === 'function') {
      (layer as any).batchDraw();
    }
  };

  const collectDragItemIds = (baseItems: CanvasItem[]) => {
    const ids = new Set<string>();
    baseItems.forEach(item => {
      ids.add(item.id);
      if (item.type === 'ContextBox') {
        store.reactiveItems.forEach(child => {
          if (child.parent === item.id) {
            ids.add(child.id);
          }
        });
      }
    });
    return ids;
  };

  const handleItemDragStart = (e: Konva.KonvaEventObject<DragEvent>, item?: CanvasItem) => {
    const stage = stageRef.value?.getStage();
    if (!stage || !item) return;

    if (!selectedItems.value.some(i => i.id === item.id)) {
      selectedItems.value = [item];
      selectedConnections.value = [];
    }

    dragState.positions.clear();

    const itemsToDrag = collectDragItemIds(selectedItems.value);
    itemsToDrag.forEach(id => {
      const node = stage.findOne(`.item-${id}`);
      if (node) {
        dragState.positions.set(id, { x: node.x(), y: node.y() });
      }
    });
  };

  const handleItemDragMove = (e: Konva.KonvaEventObject<DragEvent>, _item?: CanvasItem) => {
    if (!dragState.positions.size) return;
    const stage = stageRef.value?.getStage();
    if (!stage) return;

    const draggedNode = e.target;
    const draggedId = draggedNode.name().split('item-')[1]; // Remove 'item-' prefix
    const startPos = dragState.positions.get(draggedId);
    if (!startPos) return;

    const dx = draggedNode.x() - startPos.x;
    const dy = draggedNode.y() - startPos.y;

    dragState.positions.forEach((initialPos, itemId) => {
      const node =
        itemId === draggedId ? draggedNode : stage.findOne(`.item-${itemId}`);
      if (node) {
        const newX = initialPos.x + dx;
        const newY = initialPos.y + dy;
        node.x(newX);
        node.y(newY);
        const reactiveItem = store.reactiveItems.find(i => i.id === itemId);
        if (reactiveItem) {
          reactiveItem.x = newX;
          reactiveItem.y = newY;
        }
      }
    });
  };

  const determineNewParent = (node: Konva.Node, stage: Konva.Stage) => {
    const itemRect = node.getClientRect();
    for (const context of store.reactiveItems.filter(item => item.type === 'ContextBox')) {
      const contextNode = stage.findOne(`.item-${context.id}`);
      if (!contextNode) continue;
      const contextRect = contextNode.getClientRect();
      const inside =
        itemRect.x >= contextRect.x &&
        itemRect.y >= contextRect.y &&
        itemRect.x + itemRect.width <= contextRect.x + contextRect.width &&
        itemRect.y + itemRect.height <= contextRect.y + contextRect.height;
      if (inside) {
        return context.id;
      }
    }
    return null;
  };

  const handleItemDragEnd = (e: Konva.KonvaEventObject<DragEvent>, _item?: CanvasItem) => {
    const stage = stageRef.value?.getStage();
    if (!stage || !dragState.positions.size) {
      dragState.positions.clear();
      return;
    }

    dragState.positions.forEach((_, itemId) => {
      const node = stage.findOne(`.item-${itemId}`);
      const canvasItem = store.getItemById(itemId);
      if (!node || !canvasItem) {
        return;
      }
      const baseUpdate = { ...canvasItem, x: node.x(), y: node.y() };
      let updatedItem = baseUpdate;
      if (canvasItem.type !== 'ContextBox') {
        const newParentId = determineNewParent(node, stage);
        if (canvasItem.parent !== newParentId) {
          updatedItem = { ...baseUpdate, parent: newParentId };
        }
      }
      store.updateItem(updatedItem);
    });

    dragState.positions.clear();
    updateStageSize();
  };

  watch(selectedItems, () => {
    updateTransformer();
    if (selectedItems.value.length === 1) {
      store.setSelectedItem(selectedItems.value[0]);
    } else {
      store.setSelectedItem(null);
    }
  }, { deep: true });
  watch(() => store.activeBoard, () => {
    selectedItems.value = [];
    selectedConnections.value = [];
    store.setSelectedItem(null);
  });
  watch(() => store.reactiveItems, () => {
    updateTransformer();
  }, { deep: true });

  return {
    selectedItems,
    selectedConnections,
    stageRef,
    transformerRef,
    selectionRectRef,
    selection,
    stageConfig,
    startConnection,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleItemClick,
    handleItemTransform,
    handleItemDblClick,
    handleConnectionClick,
    handleTransformEnd,
    handleItemDragStart,
    handleItemDragMove,
    handleItemDragEnd,
    connectionMode,
  };
}
