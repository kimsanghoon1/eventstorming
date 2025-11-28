/**
 * Composable for managing Domain objects with REST API
 * GraphQL 대신 REST API 사용
 */

import { ref, computed } from 'vue';

export interface DomainObject {
    id: string;
    type: string;
    instanceName: string;
    description?: string;
    properties?: string;
}

const API_BASE = 'http://localhost:3000/api';

export const useDomain = () => {
    const domainObjects = ref<Map<string, DomainObject>>(new Map());
    const loading = ref(false);
    const error = ref<Error | null>(null);

    // Fetch single domain object
    const fetchDomainObject = async (id: string): Promise<DomainObject | null> => {
        loading.value = true;
        error.value = null;

        try {
            const response = await fetch(`${API_BASE}/domain/${id}`);
            if (!response.ok) throw new Error('Failed to fetch domain object');

            const data = await response.json();
            domainObjects.value.set(id, data);
            return data;
        } catch (e) {
            error.value = e as Error;
            console.error('Error fetching domain object:', e);
            return null;
        } finally {
            loading.value = false;
        }
    };

    // Fetch multiple domain objects
    const fetchDomainObjects = async (params?: { type?: string; contextId?: string }) => {
        loading.value = true;
        error.value = null;

        try {
            const queryParams = new URLSearchParams();
            if (params?.type) queryParams.append('type', params.type);
            if (params?.contextId) queryParams.append('contextId', params.contextId);

            const url = `${API_BASE}/domain${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch domain objects');

            const data = await response.json();
            data.forEach((obj: DomainObject) => {
                domainObjects.value.set(obj.id, obj);
            });
            return data;
        } catch (e) {
            error.value = e as Error;
            console.error('Error fetching domain objects:', e);
            return [];
        } finally {
            loading.value = false;
        }
    };

    // Create domain object
    const createDomainObject = async (input: Omit<DomainObject, 'id'>): Promise<DomainObject | null> => {
        loading.value = true;
        error.value = null;

        try {
            const response = await fetch(`${API_BASE}/domain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });

            if (!response.ok) throw new Error('Failed to create domain object');

            const data = await response.json();
            domainObjects.value.set(data.id, data);
            return data;
        } catch (e) {
            error.value = e as Error;
            console.error('Error creating domain object:', e);
            return null;
        } finally {
            loading.value = false;
        }
    };

    // Update domain object
    const updateDomainObject = async (id: string, input: Partial<DomainObject>): Promise<DomainObject | null> => {
        loading.value = true;
        error.value = null;

        try {
            const response = await fetch(`${API_BASE}/domain/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });

            if (!response.ok) throw new Error('Failed to update domain object');

            const data = await response.json();
            domainObjects.value.set(id, data);
            return data;
        } catch (e) {
            error.value = e as Error;
            console.error('Error updating domain object:', e);
            return null;
        } finally {
            loading.value = false;
        }
    };

    // Delete domain object
    const deleteDomainObject = async (id: string): Promise<boolean> => {
        loading.value = true;
        error.value = null;

        try {
            const response = await fetch(`${API_BASE}/domain/${id}`, {
                method: 'DELETE',
            });

            if (!response.ok) throw new Error('Failed to delete domain object');

            domainObjects.value.delete(id);
            return true;
        } catch (e) {
            error.value = e as Error;
            console.error('Error deleting domain object:', e);
            return false;
        } finally {
            loading.value = false;
        }
    };

    // Link two domain objects (placeholder - implement if needed)
    const linkDomainObjects = async (fromId: string, toId: string, relationType: string): Promise<boolean> => {
        // TODO: Implement REST endpoint for linking
        console.warn('linkDomainObjects not yet implemented in REST API');
        return false;
    };

    // Get domain object from cache
    const getDomainObject = (id: string): DomainObject | undefined => {
        return domainObjects.value.get(id);
    };

    // Prefetch domain objects by IDs
    const prefetchDomainObjects = async (ids: string[]) => {
        const missingIds = ids.filter(id => !domainObjects.value.has(id));

        if (missingIds.length === 0) return;

        // Fetch missing objects
        await Promise.all(missingIds.map(id => fetchDomainObject(id)));
    };

    return {
        domainObjects: computed(() => Array.from(domainObjects.value.values())),
        loading: computed(() => loading.value),
        error: computed(() => error.value),
        fetchDomainObject,
        fetchDomainObjects,
        createDomainObject,
        updateDomainObject,
        deleteDomainObject,
        linkDomainObjects,
        getDomainObject,
        prefetchDomainObjects,
    };
};
