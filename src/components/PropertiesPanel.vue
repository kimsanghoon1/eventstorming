<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { useStore } from '@/store';
import type { CanvasItem } from '@/types';
import UmlPropertyEditor from './ObjectProperties.vue';

const store = useStore();
const props = defineProps<{
  selectedItem: CanvasItem | null;
}>();

const emit = defineEmits(['generate-code', 'generate-uml', 'open-uml']);

const editableProperties = ref<Partial<CanvasItem>>({});

const umlElementTypes = ['Class', 'Interface', 'Enum', 'Package', 'Component', 'Actor', 'Relationship'];
const isUmlItem = computed(() => {
  if (!props.selectedItem) return false;
  if (store.currentView === 'uml-canvas') return true;
  return umlElementTypes.includes(props.selectedItem.type);
});
const selectedLinkedDiagram = computed(() => editableProperties.value.linkedDiagram ?? null);
const availableEvents = computed(() =>
  (store.reactiveItems || []).filter(item => item.type === 'Event' && item.parent === props.selectedItem?.parent)
);
const propertiesCount = computed(() => {
  const propsLen = editableProperties.value.properties?.length || 0;
  const attrsLen = editableProperties.value.attributes?.length || 0;
  const methodsLen = editableProperties.value.methods?.length || 0;
  const enumLen = editableProperties.value.enumValues?.length || 0;
  return propsLen + attrsLen + methodsLen + enumLen;
});

watch(
  () => props.selectedItem,
  (newItem) => {
    if (newItem) {
      editableProperties.value = { ...newItem };
    } else {
      editableProperties.value = {};
    }
  },
  { immediate: true }
);

const updateItem = () => {
  if (props.selectedItem) {
    const mergedItem: CanvasItem = {
      ...(props.selectedItem as CanvasItem),
      ...(editableProperties.value as CanvasItem),
    };
    store.updateItem(mergedItem);
  }
};

const handleProducesEventChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  const value = target.value;
  editableProperties.value.producesEventId = value ? Number(value) : undefined;
  updateItem();
};

const createNewUmlDiagram = () => {
  store.createNewUmlDiagram();
};

const openUmlDiagram = () => {
  const target = typeof selectedLinkedDiagram.value === 'string' ? selectedLinkedDiagram.value : null;
  store.openUmlDiagram(target);
};

onMounted(() => {
  store.fetchUmlBoards();
});
</script>

<template>
  <div v-if="selectedItem" class="properties-panel">
    <div class="panel-header">
      <div class="panel-title">
        <h3>{{ selectedItem.instanceName }}</h3>
        <p class="panel-subtitle">
          {{ selectedItem.type }}
          <span v-if="propertiesCount">· {{ propertiesCount }} 필드</span>
        </p>
      </div>
    </div>
    <div class="panel-content">
      <template v-if="isUmlItem && selectedItem">
        <UmlPropertyEditor :item="selectedItem" />
        <div class="form-group">
          <label>Dimensions (px)</label>
          <div class="dimension-grid">
            <div>
              <span>Width</span>
              <input
                type="number"
                min="40"
                step="10"
                v-model.number="editableProperties.width"
                @input="updateItem"
              />
            </div>
            <div>
              <span>Height</span>
              <input
                type="number"
                min="40"
                step="10"
                v-model.number="editableProperties.height"
                @input="updateItem"
              />
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="form-group">
          <label for="instanceName">Name</label>
          <input id="instanceName" v-model="editableProperties.instanceName" @input="updateItem" />
        </div>
        <div v-if="selectedItem && ['Command', 'Policy'].includes(selectedItem.type)" class="form-group">
          <label for="producesEvent">Emits Event</label>
          <select
            id="producesEvent"
            :value="editableProperties.producesEventId ?? ''"
            @change="handleProducesEventChange"
          >
            <option value="">None</option>
            <option
              v-for="eventItem in availableEvents"
              :key="eventItem.id"
              :value="eventItem.id"
            >
              {{ eventItem.instanceName }}
            </option>
          </select>
          <p class="form-hint">선택한 Command가 성공 시 발생시키는 Event를 지정하세요.</p>
        </div>

        <div class="form-group">
          <label for="description">Description</label>
          <textarea id="description" v-model="editableProperties.description" @input="updateItem" rows="4"></textarea>
        </div>

        <div v-if="selectedItem?.type === 'ContextBox'" class="form-group">
          <label>Context Actions</label>
          
          <!-- Linked Diagram Selection -->
          <div class="linked-diagram-group">
            <label class="sub-label">Linked UML</label>
            <div class="input-group">
              <select v-model="editableProperties.linkedDiagram" @change="updateItem">
                <option :value="undefined">-- None --</option>
                <option v-for="board in store.umlBoards" :key="board.boardId" :value="board.boardId">
                  {{ board.instanceName }}
                </option>
              </select>
              <button v-if="editableProperties.linkedDiagram" class="icon-btn" @click="$emit('open-uml', editableProperties.linkedDiagram)" title="Open UML">↗</button>
            </div>
          </div>

          <button type="button" class="btn btn-primary generate-btn" @click="$emit('generate-uml', selectedItem)">
            {{ editableProperties.linkedDiagram ? 'Regenerate UML' : 'Generate UML' }}
          </button>

          <button type="button" class="btn btn-primary generate-btn" @click="$emit('generate-code', selectedItem)">
            Generate Source Code
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.properties-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  width: 280px;
  background-color: #f8f9fa;
  border-left: 1px solid #dee2e6;
  display: flex;
  flex-direction: column;
  color: #333;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease-in-out;
}

.panel-header {
  padding: 1rem;
  border-bottom: 1px solid #dee2e6;
  background-color: #e9ecef;
}

.panel-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.panel-content {
  padding: 1rem;
  flex-grow: 1;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.5rem;
  font-size: 0.875rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background-color: #fff;
  color: #495057;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.form-hint {
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.uml-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.btn {
  flex: 1;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.btn-secondary {
  background-color: #4f46e5;
  color: white;
  border-color: #4f46e5;
}

.btn-secondary:hover {
  background-color: #4338ca;
  border-color: #4338ca;
}

.btn-outline {
  background-color: transparent;
  color: #4f46e5;
  border-color: #4f46e5;
}

.btn-outline:hover {
  background-color: rgba(79, 70, 229, 0.08);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dimension-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.dimension-grid span {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.dimension-grid input {
  width: 100%;
}

.btn-primary {
  background-color: #3b82f6;
  color: white;
  border-color: #3b82f6;
}
.btn-primary:hover {
  background-color: #2563eb;
  border-color: #2563eb;
}

.generate-btn {
  width: 100%;
  margin-top: 0.5rem;
}

.linked-diagram-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}
.sub-label {
  font-size: 0.8rem;
  color: #6b7280;
}
.input-group {
  display: flex;
  gap: 4px;
}
.input-group input {
  flex: 1;
}
.icon-btn {
  background-color: #f8f9fa;
  border: 1px solid #ced4da;
  color: #495057;
  border-radius: 4px;
  width: 36px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}
.icon-btn:hover {
  background-color: #e9ecef;
  border-color: #adb5bd;
  color: #212529;
}
</style>