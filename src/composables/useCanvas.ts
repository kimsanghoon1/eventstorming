/**
 * Composable for managing Canvas positions with Y.js
 * Canvas 위치 정보만 Y.js로 관리
 */

import { ref, computed, watch } from 'vue';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface CanvasPosition {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    domainObjectId: string;
}

export const useCanvas = (boardId: string) => {
    const ydoc = new Y.Doc();
    const provider = ref<WebsocketProvider | null>(null);
    const canvasItems = ref<CanvasPosition[]>([]);
    const isConnected = ref(false);

    // Initialize Y.js connection
    const connect = () => {
        provider.value = new WebsocketProvider(
            'ws://localhost:3000',
            boardId,
            ydoc
        );

        provider.value.on('status', (event: { status: string }) => {
            isConnected.value = event.status === 'connected';
        });

        // Observe Y.Array changes
        const yItems = ydoc.getArray<Y.Map<any>>('canvasItems');

        // Initial load
        updateCanvasItems();

        // Watch for changes
        yItems.observe(() => {
            updateCanvasItems();
        });
    };

    // Update local canvas items from Y.Doc
    const updateCanvasItems = () => {
        const yItems = ydoc.getArray<Y.Map<any>>('canvasItems');
        canvasItems.value = yItems.toJSON() as CanvasPosition[];
    };

    // Add new canvas item
    const addCanvasItem = (item: CanvasPosition) => {
        const yItems = ydoc.getArray<Y.Map<any>>('canvasItems');
        const yMap = new Y.Map();
        for (const [key, val] of Object.entries(item)) {
            yMap.set(key, val);
        }
        yItems.push([yMap]);
    };

    // Update canvas item position
    const updateCanvasItemPosition = (id: string, position: Partial<CanvasPosition>) => {
        const yItems = ydoc.getArray<Y.Map<any>>('canvasItems');
        const index = canvasItems.value.findIndex(item => item.id === id);

        if (index !== -1) {
            const yMap = yItems.get(index);
            if (yMap instanceof Y.Map) {
                Object.entries(position).forEach(([key, value]) => {
                    if (value !== undefined) {
                        yMap.set(key, value);
                    }
                });
            }
        }
    };

    // Delete canvas item
    const deleteCanvasItem = (id: string) => {
        const yItems = ydoc.getArray<Y.Map<any>>('canvasItems');
        const index = canvasItems.value.findIndex(item => item.id === id);

        if (index !== -1) {
            yItems.delete(index, 1);
        }
    };

    // Find canvas item by domain object ID
    const findByDomainObjectId = (domainObjectId: string): CanvasPosition | undefined => {
        return canvasItems.value.find(item => item.domainObjectId === domainObjectId);
    };

    // Get canvas item by ID
    const getById = (id: string): CanvasPosition | undefined => {
        return canvasItems.value.find(item => item.id === id);
    };

    // Disconnect
    const disconnect = () => {
        provider.value?.disconnect();
        provider.value?.destroy();
    };

    return {
        canvasItems: computed(() => canvasItems.value),
        isConnected: computed(() => isConnected.value),
        connect,
        disconnect,
        addCanvasItem,
        updateCanvasItemPosition,
        deleteCanvasItem,
        findByDomainObjectId,
        getById,
    };
};
