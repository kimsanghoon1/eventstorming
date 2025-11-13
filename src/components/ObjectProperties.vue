<script setup lang="ts">
import { defineProps, computed, ref, watch, nextTick } from 'vue';
import type { CanvasItem, UmlAttribute, UmlOperation, Property } from '../types';
import { store } from '../store';

const props = defineProps<{
  item: CanvasItem;
}>();

const localItem = ref<CanvasItem>(JSON.parse(JSON.stringify(props.item)));
const newEnumValue = ref('');

const classStereotypes = ['', 'AggregateRoot', 'Entity', 'ValueObject', 'Factory'];
const interfaceStereotypes = ['', 'Service', 'Policy', 'Factory'];

const availableStereotypes = computed(() => {
    if (props.item?.type === 'Class') return classStereotypes;
    if (props.item?.type === 'Interface') return interfaceStereotypes;
    return [];
});

const availableEvents = computed(() => store.canvasItems.filter(item => item.type === 'Event'));
const availableTypes = computed(() => [...new Set(store.canvasItems.map(item => item.type))]);

watch(() => props.item, (newItem) => {
  localItem.value = JSON.parse(JSON.stringify(newItem));
}, { deep: true });

const update = () => {
  nextTick(() => {
    store.updateItem(localItem.value.id, localItem.value);
  });
};

const addProperty = (type: 'properties' | 'attributes' | 'methods' | 'enumValues') => {
  if (!localItem.value[type]) {
    localItem.value[type] = [];
  }
  
  let newItem: any;
  if (type === 'properties') newItem = { key: 'newKey', value: 'newValue' };
  if (type === 'attributes') newItem = { visibility: 'private', name: 'newAttr', type: 'string' };
  if (type === 'methods') newItem = { visibility: 'public', name: 'newMethod', parameters: [], returnType: 'void' };
  if (type === 'enumValues') {
    if (newEnumValue.value) {
      newItem = newEnumValue.value;
      newEnumValue.value = '';
    } else {
      return;
    }
  }
  
  (localItem.value[type] as any[]).push(newItem);
  update();
};

const removeProperty = (type: 'properties' | 'attributes' | 'methods' | 'enumValues', index: number) => {
  if (localItem.value[type]) {
    (localItem.value[type] as any[]).splice(index, 1);
    update();
  }
};
</script>

<template>
  <div class="object-properties">
    <!-- Common Properties -->
    <div class="form-section">
      <label>Instance Name</label>
      <input type="text" v-model="localItem.instanceName" @blur="update" />
    </div>
    <div class="form-section">
      <label>Description</label>
      <textarea v-model="localItem.description" @blur="update" rows="3"></textarea>
    </div>

    <!-- Stereotype -->
    <div v-if="['Class', 'Interface'].includes(item.type)" class="form-section">
      <label>Stereotype</label>
      <select v-model="localItem.stereotype" @change="update">
        <option v-for="s in availableStereotypes" :key="s" :value="s || undefined">{{ s || 'None' }}</option>
      </select>
    </div>
    
    <!-- Properties Section -->
    <div v-if="item.properties" class="properties-list">
      <h4>Fields</h4>
      <div v-for="(prop, index) in localItem.properties" :key="index" class="property-item">
        <input type="text" v-model="prop.key" @blur="update" placeholder="Key" />
        <input type="text" v-model="prop.value" @blur="update" placeholder="Value" />
        <button @click="removeProperty('properties', index)" class="delete-btn">×</button>
      </div>
      <button @click="addProperty('properties')" class="add-btn">+ Add Field</button>
    </div>
    
    <!-- Attributes Section -->
    <div v-if="item.attributes" class="properties-list">
      <h4>Attributes</h4>
      <div v-for="(attr, index) in localItem.attributes" :key="index" class="property-item attribute-item">
        <select v-model="attr.visibility" @change="update">
          <option>public</option>
          <option>private</option>
          <option>protected</option>
        </select>
        <input type="text" v-model="attr.type" @blur="update" placeholder="Type" />
        <input type="text" v-model="attr.name" @blur="update" placeholder="Name" />
        <button @click="removeProperty('attributes', index)" class="delete-btn">×</button>
      </div>
      <button @click="addProperty('attributes')" class="add-btn">+ Add Attribute</button>
    </div>

    <!-- Methods Section -->
    <div v-if="item.methods" class="properties-list">
      <h4>Methods</h4>
      <div v-for="(method, index) in localItem.methods" :key="index" class="property-item">
        <input type="text" v-model="method.name" @blur="update" placeholder="Name" />
        <input type="text" v-model="method.returnType" @blur="update" placeholder="Return Type" />
        <button @click="removeProperty('methods', index)" class="delete-btn">×</button>
      </div>
      <button @click="addProperty('methods')" class="add-btn">+ Add Method</button>
    </div>

    <!-- Enum Values -->
    <div v-if="item.enumValues" class="properties-list">
      <h4>Enum Values</h4>
      <div v-for="(val, index) in localItem.enumValues" :key="index" class="property-item">
        <input type="text" v-model="localItem.enumValues[index]" @blur="update" placeholder="Value" />
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
</style>