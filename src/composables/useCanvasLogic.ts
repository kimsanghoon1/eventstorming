import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import Konva from 'konva';
import { store } from '../store';
import type { CanvasItem } from '../types';

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

  const connectionMode = ref<{ active: boolean; type: string | null; from: number | null }>({ active: false, type: null, from: null });

  const stageConfig = ref({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const updateStageSize = () => {
    const items = store.canvasItems?.toJSON() ?? [];
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

  watch(() => store.canvasItems, updateStageSize, { deep: true });

  const startConnection = (type: string) => {
    connectionMode.value = { active: true, type: type, from: null };
    selectedItems.value = [];
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
    if (e.key === 'Escape') {
      if (connectionMode.value.active) {
        cancelConnectionMode();
      } else {
        selectedItems.value = [];
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      if (store.canvasItems) {
        selectedItems.value = store.canvasItems.toJSON();
      }
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
        store.deleteItems(itemIdsToDelete);
        // Also delete connections attached to these items
        const connIdsToDelete: string[] = [];
        store.connections?.forEach(conn => {
            const connJson = conn.toJSON();
            if (itemIdsToDelete.includes(connJson.from) || itemIdsToDelete.includes(connJson.to)) {
                connIdsToDelete.push(connJson.id);
            }
        });
        store.deleteConnections(connIdsToDelete);
        selectedItems.value = [];
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
    if (e.target !== e.target.getStage() || connectionMode.value.active) {
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

    if (!stageRef.value || !selectionRectRef.value || !store.canvasItems) return;
    const stage = stageRef.value.getStage();
    const box = selectionRectRef.value.getNode().getClientRect();
    const newlySelected: CanvasItem[] = [];
    store.canvasItems.forEach((yItem) => {
      const item = yItem.toJSON() as CanvasItem;
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
        connectionMode.value.from = item.id;
      } else {
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

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    if (!transformerRef.value) return;
    const transformer = transformerRef.value.getNode();
    const nodes = (e.target as any) === transformer ? transformer.nodes() : [e.target];
    
    store.doc?.transact(() => {
      nodes.forEach((node: Konva.Node) => {
          const id = Number(node.name().split('-')[1]);
          const index = store.canvasItems?.toArray().findIndex(i => i.get('id') === id);
          if (index !== undefined && index > -1) {
              const yItem = store.canvasItems!.get(index);
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();

              node.scaleX(1);
              node.scaleY(1);

              yItem.set('x', node.x());
              yItem.set('y', node.y());
              yItem.set('rotation', node.rotation());
              yItem.set('width', Math.max(5, yItem.get('width') * scaleX));
              yItem.set('height', Math.max(5, yItem.get('height') * scaleY));
          }
      });
    });
    updateTransformer();
  };

  const updateTransformer = () => {
    if (!transformerRef.value || !stageRef.value) return;
    const transformerNode = transformerRef.value.getNode();
    const stage = stageRef.value.getStage();
    
    const selectedNodes = selectedItems.value.map(item => {
      return stage.findOne('.item-' + item.id);
    }).filter((n): n is Konva.Node => !!n);

    transformerNode.nodes(selectedNodes);
    transformerNode.getLayer()?.batchDraw();
  };

  const dragStartPositions = ref<Map<number, {x: number, y: number}>>(new Map());

  const handleItemDragStart = (e: Konva.KonvaEventObject<DragEvent>, item: CanvasItem) => {
    const stage = stageRef.value?.getStage();
    if (!stage) return;

    if (!selectedItems.value.some(i => i.id === item.id)) {
      selectedItems.value = [item];
    }
    
    dragStartPositions.value.clear();
    const itemsToDrag = new Set<number>();

    selectedItems.value.forEach(selectedItem => {
      itemsToDrag.add(selectedItem.id);
      if (selectedItem.type === 'ContextBox') {
        store.canvasItems?.forEach(childYMap => {
          const child = childYMap.toJSON();
          if (child.parent === selectedItem.id) {
            itemsToDrag.add(child.id);
          }
        });
      }
    });

    itemsToDrag.forEach(itemId => {
      const node = stage.findOne('.item-' + itemId);
      if (node) {
        dragStartPositions.value.set(itemId, { x: node.x(), y: node.y() });
      }
    });
  };

  const handleItemDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const draggedNode = e.target;
    const startPos = dragStartPositions.value.get(Number(draggedNode.name().split('-')[1]));

    if (!startPos) return;

    const dx = draggedNode.x() - startPos.x;
    const dy = draggedNode.y() - startPos.y;

    dragStartPositions.value.forEach((initialPos, itemId) => {
        const node = stageRef.value?.getStage().findOne('.item-' + itemId);
        if (node && node !== draggedNode) {
            node.x(initialPos.x + dx);
            node.y(initialPos.y + dy);
        }
    });
  };

  const handleItemDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = stageRef.value?.getStage();
    if (!stage || !store.canvasItems) {
      dragStartPositions.value.clear();
      return;
    }

    store.doc?.transact(() => {
        dragStartPositions.value.forEach((_, itemId) => {
            const node = stage.findOne('.item-' + itemId);
            if (node) {
                const index = store.canvasItems!.toArray().findIndex(i => i.get('id') === itemId);
                if (index > -1) {
                    const yItem = store.canvasItems!.get(index);
                    yItem.set('x', node.x());
                    yItem.set('y', node.y());
                }
            }
        });
    });

    // After updating the store, check for parent changes
    const draggedNode = e.target;
    const draggedItemId = Number(draggedNode.name().split('-')[1]);
    const draggedItem = store.canvasItems.toArray().find(i => i.get('id') === draggedItemId)?.toJSON();

    if (draggedItem && draggedItem.type !== 'ContextBox') {
      const contextBoxes = store.canvasItems.toArray().filter(i => i.get('type') === 'ContextBox');
      let newParentId: number | null = null;

      const itemRect = draggedNode.getClientRect();

      for (const yCb of contextBoxes) {
        const cb = yCb.toJSON();
        const cbNode = stage.findOne('.item-' + cb.id);
        if (cbNode) {
          const cbRect = cbNode.getClientRect();
          if (
            itemRect.x > cbRect.x &&
            itemRect.y > cbRect.y &&
            itemRect.x + itemRect.width < cbRect.x + cbRect.width &&
            itemRect.y + itemRect.height < cbRect.y + cbRect.height
          ) {
            newParentId = cb.id;
            break;
          }
        }
      }

      if (draggedItem.parent !== newParentId) {
        store.updateItem({ ...draggedItem, parent: newParentId });
      }
    }
    
    dragStartPositions.value.clear();
  };

  watch(selectedItems, updateTransformer, { deep: true });
  watch(() => store.activeBoard, () => { selectedItems.value = []; });
  watch(() => store.canvasItems, () => {
      // Force update transformer when items change from remote
      updateTransformer();
  }, { deep: true });

  return {
    selectedItems,
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
    handleTransformEnd,
    handleItemDragStart,
    handleItemDragMove,
    handleItemDragEnd,
  };
}
