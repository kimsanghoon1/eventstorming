<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, onMounted } from 'vue';
import type { CanvasItem, UmlAttribute, UmlOperation, Property } from '../types';
import { store } from '../store';

onMounted(() => {
  store.fetchUmlBoards();
});

const props = defineProps<{
  item: CanvasItem;
}>();

const cloneItem = (item: CanvasItem): CanvasItem =>
  JSON.parse(JSON.stringify(item));

const localItem = ref<CanvasItem>(cloneItem(props.item));
const newEnumValue = ref('');
const enumValues = computed(() => {
  if (!localItem.value.enumValues) {
    localItem.value.enumValues = [];
  }
  return localItem.value.enumValues;
});

const classStereotypes = ['', 'AggregateRoot', 'Entity', 'ValueObject', 'Factory'];
const interfaceStereotypes = ['', 'Service', 'Policy', 'Factory'];

const availableStereotypes = computed(() => {
    if (props.item?.type === 'Class') return classStereotypes;
    if (props.item?.type === 'Interface') return interfaceStereotypes;
    return [];
});

watch(
  () => props.item,
  (newItem) => {
    localItem.value = cloneItem(newItem);
  },
  { deep: false }
);

let updateTimer: ReturnType<typeof setTimeout> | null = null;

const flushUpdate = () => {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  store.updateItem(cloneItem(localItem.value));
};

const scheduleUpdate = () => {
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  updateTimer = setTimeout(flushUpdate, 150);
};
onBeforeUnmount(() => {
  flushUpdate();
  });

const addProperty = (type: 'properties' | 'attributes' | 'methods' | 'enumValues') => {
  if (!localItem.value[type]) {
    localItem.value[type] = [];
  }
  
  let newItem: any;
  if (type === 'properties') newItem = { key: 'newKey', value: 'newValue' };
  if (type === 'attributes') newItem = { visibility: 'private', name: 'newAttr', type: 'string' };
  if (type === 'methods') newItem = { visibility: 'public', name: 'newMethod', parameters: [], returnType: 'void' };
  if (type === 'enumValues') {
    if (!newEnumValue.value) {
      return;
    }
    newItem = newEnumValue.value;
    newEnumValue.value = '';
  }
  
  (localItem.value[type] as any[]).push(newItem);
  scheduleUpdate();
};

const removeProperty = (type: 'properties' | 'attributes' | 'methods' | 'enumValues', index: number) => {
  if (localItem.value[type]) {
    (localItem.value[type] as any[]).splice(index, 1);
    scheduleUpdate();
  }
};
</script>

<template>
  <div class="object-properties">
    <!-- Common Properties -->
    <div class="form-section">
      <label>Instance Name</label>
      <input type="text" v-model="localItem.instanceName" @input="scheduleUpdate" />
    </div>
    <div class="form-section">
      <label>Description</label>
      <textarea v-model="localItem.description" @input="scheduleUpdate" rows="3"></textarea>
    </div>

    <!-- Stereotype -->
    <div v-if="['Class', 'Interface'].includes(item.type)" class="form-section">
      <label>Stereotype</label>
      <select v-model="localItem.stereotype" @change="scheduleUpdate">
        <option v-for="s in availableStereotypes" :key="s" :value="s || undefined">{{ s || 'None' }}</option>
      </select>
    </div>

    <!-- Context Actions (ContextBox) -->
    <div v-if="item.type === 'ContextBox'" class="form-section">
      <label>Context Actions</label>
      
      <!-- Linked Diagram Selection -->
      <div class="linked-diagram-group">
        <label class="sub-label">Linked UML</label>
        <div class="input-group">
          <select v-model="localItem.linkedDiagram" @change="scheduleUpdate">
            <option :value="undefined">-- None --</option>
            <option v-for="board in store.umlBoards" :key="board.boardId" :value="board.boardId">
              {{ board.instanceName }}
            </option>
          </select>
          <button v-if="localItem.linkedDiagram" class="icon-btn" @click="$emit('open-uml', localItem.linkedDiagram)" title="Open UML">↗</button>
        </div>
      </div>

      <button class="action-btn generate-btn" @click="$emit('generate-uml', localItem)">
        {{ localItem.linkedDiagram ? 'Regenerate UML' : 'Generate UML' }}
      </button>

      <button class="action-btn generate-btn" @click="$emit('generate-code', localItem)">
        Generate Source Code
      </button>
    </div>
    
    <!-- Properties Section -->
    <div v-if="item.properties" class="properties-list">
      <h4>Fields</h4>
      <div v-for="(prop, index) in localItem.properties" :key="index" class="property-item">
        <input type="text" v-model="prop.key" @input="scheduleUpdate" placeholder="Key" />
        <input type="text" v-model="prop.value" @input="scheduleUpdate" placeholder="Value" />
        <button @click="removeProperty('properties', index)" class="delete-btn">×</button>
      </div>
      <button @click="addProperty('properties')" class="add-btn">+ Add Field</button>
    </div>
    
    <!-- Attributes Section -->
    <div v-if="item.attributes" class="properties-list">
      <h4>Attributes</h4>
      <div v-for="(attr, index) in localItem.attributes" :key="index" class="property-item attribute-item">
        <select v-model="attr.visibility" @change="scheduleUpdate">
          <option>public</option>
          <option>private</option>
          <option>protected</option>
        </select>
        <input type="text" v-model="attr.type" @input="scheduleUpdate" placeholder="Type" />
        <input type="text" v-model="attr.name" @input="scheduleUpdate" placeholder="Name" />
        <button @click="removeProperty('attributes', index)" class="delete-btn">×</button>
      </div>
      <button @click="addProperty('attributes')" class="add-btn">+ Add Attribute</button>
    </div>

    <!-- Methods Section -->
    <div v-if="item.methods" class="properties-list">
      <h4>Methods</h4>
      <div v-for="(method, index) in localItem.methods" :key="index" class="property-item">
        <input type="text" v-model="method.name" @input="scheduleUpdate" placeholder="Name" />
        <input type="text" v-model="method.returnType" @input="scheduleUpdate" placeholder="Return Type" />
        <button @click="removeProperty('methods', index)" class="delete-btn">×</button>
      </div>
      <button @click="addProperty('methods')" class="add-btn">+ Add Method</button>
    </div>

    <!-- Enum Values -->
    <div v-if="enumValues.length" class="properties-list">
      <h4>Enum Values</h4>
      <div v-for="(val, index) in enumValues" :key="index" class="property-item">
        <input
          type="text"
          v-model="enumValues[index]"
          @input="scheduleUpdate"
          placeholder="Value"
        />
        <button @click="removeProperty('enumValues', index)" class="delete-btn">×</button>
      </div>
       <div class="property-item">
        <input v-model="newEnumValue" @keyup.enter="addProperty('enumValues')" placeholder="New value" />
        <button @click="addProperty('enumValues')" class="add-btn" style="width: auto; padding: 0 12px;">+</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.object-properties {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.form-section, .properties-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background-color: var(--color-background-soft); /* Slightly lighter than the panel background */
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
}
label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
}
input[type="text"],
textarea,
select {
  background-color: var(--vt-c-black-mute); /* A distinct, darker background for inputs */
  border: 1px solid var(--vt-c-divider-dark-1); /* A more visible border */
  border-radius: 6px;
  padding: 8px 12px;
  color: var(--color-text);
  font-size: 0.9rem;
  transition: all 0.2s ease; /* Transition all properties */
}
input[type="text"]:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: #42b983;
  background-color: var(--vt-c-black); /* Darken background on focus */
  box-shadow: 0 0 0 1px #42b983, inset 0 1px 2px rgba(0,0,0,0.5); /* Add glow and inset shadow */
}
textarea {
  resize: vertical;
  min-height: 60px;
}

.properties-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  /* padding-top: 1rem; */
  /* border-top: 1px solid var(--color-border); */
}
h4 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-heading);
  margin: 0;
}
.property-item {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.5rem;
  align-items: center;
}

.attribute-item {
  grid-template-columns: auto 1fr 1fr auto;
}

.delete-btn {
  background: transparent;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  font-size: 1.5rem;
  line-height: 1;
  padding: 0 4px;
  opacity: 0.7;
  transition: opacity 0.2s;
}
.delete-btn:hover {
  opacity: 1;
  color: #ff6b6b;
}

.add-btn {
  background-color: rgba(66, 185, 131, 0.2);
  border: 1px solid #42b983;
  color: #42b983;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s, color 0.2s;
  margin-top: 0.5rem;
}
.add-btn:hover {
  background-color: #42b983;
  color: var(--vt-c-white);
}

.generate-btn {
  width: 100%;
  background-color: #3b82f6; /* Blue */
  color: white;
  border: none;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  margin-top: 0.5rem;
}
.generate-btn:hover {
  background-color: #2563eb;
}

.linked-diagram-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}
.sub-label {
  font-size: 0.8rem;
  color: var(--color-text-mute);
}
.input-group {
  display: flex;
  gap: 4px;
}
.input-group input {
  flex: 1;
}
.icon-btn {
  background-color: var(--vt-c-black-mute);
  border: 1px solid var(--vt-c-divider-dark-1);
  color: var(--color-text);
  border-radius: 6px;
  width: 36px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}
.icon-btn:hover {
  background-color: var(--vt-c-black);
  border-color: #42b983;
  color: #42b983;
}
</style>