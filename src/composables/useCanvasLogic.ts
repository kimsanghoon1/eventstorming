import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue';
import Konva from 'konva';
import { store } from '../store';
import type { CanvasItem, Connection } from '../types';

export function useCanvasLogic() {
  const selectedItems = ref<CanvasItem[]>([]);
  const stageRef = ref<{ getStage: () => Konva.Stage } | null>(null);
  const transformerRef = ref<{ getNode: () => Konva.Transformer } | null>(null);
  const selectionRectRef = ref<{ getNode: () => Konva.Rect } | null>(null);
  const selection = ref({
    visible: false,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
  });

  const stageConfig = ref({
    width: 100,
    height: 100,
  });

  const handleResize = () => {
    const wrapper = document.querySelector('.canvas-wrapper');
    if (wrapper) {
      stageConfig.value = {
        width: wrapper.clientWidth,
        height: wrapper.clientHeight,
      };
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
      return;
    }
    if (e.key === 'Escape') {
      selectedItems.value = [];
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      selectedItems.value = [...store.canvasItems];
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      store.undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      store.redo();
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      const idsToDelete = new Set(selectedItems.value.map(item => item.id));
      if (idsToDelete.size > 0) {
        store.canvasItems = store.canvasItems.filter(item => !idsToDelete.has(item.id));
        store.connections = store.connections.filter(conn => !idsToDelete.has(conn.from) && !idsToDelete.has(conn.to));
        selectedItems.value = [];
        store.pushState();
      }
    }
  };

  onMounted(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('keydown', handleKeyDown);
  });

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage()) {
      return;
    }
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
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
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!selection.value.visible) {
      return;
    }
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    selection.value.x2 = pos.x;
    selection.value.y2 = pos.y;
  };

  const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!selection.value.visible) {
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
    store.canvasItems.forEach((item: CanvasItem) => {
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
    const isCtrlPressed = e.evt.ctrlKey || e.evt.metaKey;
    const isItemAlreadySelected = selectedItems.value.some(i => i.id === item.id);

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
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    if (!transformerRef.value) return;
    const transformer = transformerRef.value.getNode();
    const nodes = (e.target as any) === transformer ? transformer.nodes() : [e.target];
    
    nodes.forEach((node: Konva.Node) => {
        const id = Number(node.name().split('-')[1]);
        const item = store.canvasItems.find((i: CanvasItem) => i.id === id);
        if (item) {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();

            node.scaleX(1);
            node.scaleY(1);

            item.x = node.x();
            item.y = node.y();
            item.rotation = node.rotation();
            item.width = Math.max(5, item.width * scaleX);
            item.height = Math.max(5, item.height * scaleY);
        }
    });
    updateTransformer();
    store.pushState();
    const transformerNode = transformerRef.value?.getNode();
    if (transformerNode) {
      transformerNode.forceUpdate();
    }
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
    if (layer) {
      layer.batchDraw();
    }
  };

  watch(selectedItems, updateTransformer);
  watch(() => store.activeBoard, () => { selectedItems.value = []; });

  return {
    selectedItems,
    stageRef,
    transformerRef,
    selectionRectRef,
    selection,
    stageConfig,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleItemClick,
    handleTransformEnd,
  };
}
