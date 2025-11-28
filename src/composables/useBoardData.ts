/**
 * Composable that combines Canvas (Y.js) and Domain (GraphQL)
 * Canvas 위치와 Domain 정보를 조합하여 전체 CanvasItem 제공
 */

import { ref, computed, watch } from 'vue';
import { useCanvas, type CanvasPosition } from './useCanvas';
import { useDomain, type DomainObject } from './useDomain';

export interface EnrichedCanvasItem extends CanvasPosition {
    domain?: DomainObject;
}

export const useBoardData = (boardId: string) => {
    const canvas = useCanvas(boardId);
    const domain = useDomain();

    // Enriched items with domain data
    const enrichedItems = computed<EnrichedCanvasItem[]>(() => {
        return canvas.canvasItems.value.map(canvasItem => ({
            ...canvasItem,
            domain: domain.getDomainObject(canvasItem.domainObjectId),
        }));
    });

    // Initialize board
    const initialize = async () => {
        // Connect to Y.js
        canvas.connect();

        // Wait for canvas items to load
        await new Promise(resolve => {
            const unwatch = watch(() => canvas.canvasItems.value, (items) => {
                if (items.length > 0) {
                    unwatch();
                    resolve(null);
                }
            }, { immediate: true });
        });

        // Prefetch all domain objects
        const domainIds = canvas.canvasItems.value.map(item => item.domainObjectId);
        await domain.prefetchDomainObjects(domainIds);
    };

    // Create new item (Canvas + Domain)
    const createItem = async (params: {
        type: string;
        instanceName: string;
        description?: string;
        x: number;
        y: number;
        width?: number;
        height?: number;
    }) => {
        // 1. Create domain object via GraphQL
        const domainObj = await domain.createDomainObject({
            type: params.type,
            instanceName: params.instanceName,
            description: params.description || '',
        });

        // Update item domain (Domain only)
        const updateItemDomain = async (id: string, domainUpdate: Partial<DomainObject>) => {
            const canvasItem = canvas.getById(id);
            if (!canvasItem) return null;

            return await domain.updateDomainObject(canvasItem.domainObjectId, domainUpdate);
        };

        // Delete item (Canvas + Domain)
        const deleteItem = async (id: string) => {
            const canvasItem = canvas.getById(id);
            if (!canvasItem) return false;

            // Delete from both
            canvas.deleteCanvasItem(id);
            await domain.deleteDomainObject(canvasItem.domainObjectId);

            return true;
        };

        // Cleanup
        const cleanup = () => {
            canvas.disconnect();
        };

        return {
            // State
            enrichedItems,
            isConnected: canvas.isConnected,
            loading: domain.loading,
            error: domain.error,

            // Methods
            initialize,
            createItem,
            updateItemPosition,
            updateItemDomain,
            deleteItem,
            cleanup,

            // Direct access
            canvas,
            domain,
        };
    };
