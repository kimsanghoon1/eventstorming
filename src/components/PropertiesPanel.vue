<script setup lang="ts">
import { defineProps, defineEmits, ref, watch, nextTick, computed } from 'vue';
import { store } from '../store';
import type { CanvasItem, Connection, UmlAttribute, UmlOperation, UmlParameter, Property } from "../types";

const props = defineProps({
  modelValue: Object as () => CanvasItem
});

const emit = defineEmits(['update:modelValue']);

const localItem = ref<any>({});
const newEnumValue = ref('');

const classStereotypes = ['', 'AggregateRoot', 'Entity', 'ValueObject', 'Factory'];
const interfaceStereotypes = ['', 'Service', 'Policy', 'Factory'];

const availableStereotypes = computed(() => {
    if (props.modelValue?.type === 'Class') {
        return classStereotypes;
    }
    if (props.modelValue?.type === 'Interface') {
        return interfaceStereotypes;
    }
    return [];
});

watch(() => props.modelValue, (newItem) => {
  if (newItem) {
    localItem.value = JSON.parse(JSON.stringify(newItem));
  }
}, { deep: true, immediate: true });

const umlBoards = computed(() => {
  return store.boards.filter(b => b.type === 'UML');
});

const connections = computed(() => {
    if (!store.connections || !props.modelValue) return [];
    return store.connections.toJSON().filter(c => c.from === props.modelValue!.id || c.to === props.modelValue!.id);
});

const getConnectedItemName = (conn: Connection) => {
    const otherId = conn.from === localItem.value.id ? conn.to : conn.from;
    const otherItem = store.canvasItems?.toJSON().find(i => i.id === otherId);
    return otherItem?.instanceName || 'Unknown';
};

const update = () => {
  nextTick(() => {
    emit('update:modelValue', localItem.value);
  });
};

const updateConnection = (conn: Connection) => {
    store.updateConnection(conn);
}

const addProperty = () => {
  if (!localItem.value.properties) {
    localItem.value.properties = [];
  }
  localItem.value.properties.push({ key: 'newKey', value: 'newValue' });
  update();
};

const removeProperty = (index: number) => {
  localItem.value.properties.splice(index, 1);
  update();
};

const addAttribute = () => {
  if (!localItem.value.attributes) {
    localItem.value.attributes = [];
  }
  const newAttribute: UmlAttribute = {
    visibility: 'private',
    name: `newAttr${localItem.value.attributes.length + 1}`,
    type: 'string',
    defaultValue: ''
  };
  localItem.value.attributes.push(newAttribute);
  update();
};

const removeAttribute = (index: number) => {
  localItem.value.attributes.splice(index, 1);
  update();
};

const addMethod = () => {
  if (!localItem.value.methods) {
    localItem.value.methods = [];
  }
  const newMethod: UmlOperation = {
    visibility: 'public',
    name: `newMethod${localItem.value.methods.length + 1}`,
    parameters: [],
    returnType: 'void'
  };
  localItem.value.methods.push(newMethod);
  update();
};

const removeMethod = (index: number) => {
  localItem.value.methods.splice(index, 1);
  update();
};

const addEnumValue = () => {
    if (!localItem.value.enumValues) {
        localItem.value.enumValues = [];
    }
    if (newEnumValue.value) {
        localItem.value.enumValues.push(newEnumValue.value);
        newEnumValue.value = '';
        update();
    }
};

const removeEnumValue = (index: number) => {
    localItem.value.enumValues.splice(index, 1);
    update();
};

const formatParams = (params: UmlParameter[] | undefined) => {
  if (!params) return '';
  return params.map(p => `${p.name}: ${p.type}`).join(', ');
};

const goToLinkedDiagram = () => {
  if (localItem.value.linkedDiagram) {
    store.loadBoard(localItem.value.linkedDiagram);
  }
};

</script>

<template>
  <div v-if="modelValue" class="properties-panel">
    <div class="panel-header">
      <h3>{{ localItem.instanceName }}</h3>
      <span class="item-type">{{ modelValue.type }}</span>
    </div>
    
    <div class="form-section">
      <label>Instance Name:</label>
      <input v-model="localItem.instanceName" @blur="update" />
    </div>

    <div v-if="modelValue.type === 'Class' || modelValue.type === 'Interface'" class="form-section">
        <label>Stereotype:</label>
        <select v-model="localItem.stereotype" @change="update">
            <option v-for="stereotype in availableStereotypes" :key="stereotype" :value="stereotype || undefined">
                {{ stereotype || 'None' }}
            </option>
        </select>
    </div>

    <div v-if="modelValue.type === 'Aggregate'" class="form-section">
      <label for="linked-diagram">Linked UML Diagram:</label>
      <select id="linked-diagram" v-model="localItem.linkedDiagram" @change="update">
        <option :value="null">None</option>
        <option v-for="board in umlBoards" :key="board.name" :value="board.name">
          {{ board.name }}
        </option>
      </select>
      <button 
        @click="goToLinkedDiagram" 
        :disabled="!localItem.linkedDiagram" 
        class="add-btn" 
        style="margin-top: 10px; background-color: #17a2b8;"
      >
        Go to Diagram
      </button>
    </div>

    <!-- Generic Properties for EventCanvas -->
    <div v-if="!['Class', 'Interface', 'Enum'].includes(modelValue.type)" class="properties-section">
      <h4>Fields</h4>
      <div v-for="(prop, index) in localItem.properties" :key="index" class="property-item">
        <input v-model="prop.key" @blur="update" placeholder="Key" class="key-input" />
        <span class="separator">:</span>
        <input v-model="prop.value" @blur="update" placeholder="Value" class="value-input" />
        <button @click="removeProperty(index)" class="delete-btn" title="Remove Field">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M 10 2 L 9 3 L 4 3 L 4 5 L 20 5 L 20 3 L 15 3 L 14 2 L 10 2 z M 5 7 L 5 22 L 19 22 L 19 7 L 5 7 z M 8 9 L 10 9 L 10 20 L 8 20 L 8 9 z M 14 9 L 16 9 L 16 20 L 14 20 L 14 9 z"/>
          </svg>
        </button>
      </div>
      <button @click="addProperty" class="add-btn">+ Add Field</button>
    </div>

    <!-- Enum Values -->
    <div v-if="modelValue.type === 'Enum'" class="properties-section">
        <h4>Enum Values</h4>
        <div v-for="(enumValue, index) in localItem.enumValues" :key="index" class="property-item">
            <input v-model="localItem.enumValues[index]" @blur="update" placeholder="Value" class="value-input" />
            <button @click="removeEnumValue(index)" class="delete-btn" title="Remove Value">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M 10 2 L 9 3 L 4 3 L 4 5 L 20 5 L 20 3 L 15 3 L 14 2 L 10 2 z M 5 7 L 5 22 L 19 22 L 19 7 L 5 7 z M 8 9 L 10 9 L 10 20 L 8 20 L 8 9 z M 14 9 L 16 9 L 16 20 L 14 20 L 14 9 z"/>
                </svg>
            </button>
        </div>
        <div class="property-item">
            <input v-model="newEnumValue" @keyup.enter="addEnumValue" placeholder="New value" class="value-input" />
            <button @click="addEnumValue" class="add-btn" style="margin-top: 0; width: auto; padding: 6px 10px;">+</button>
        </div>
    </div>

    <!-- Specific Properties for UmlCanvas -->
    <div v-if="modelValue.type === 'Class' || modelValue.type === 'Interface'" class="properties-section">
      <h4>Attributes</h4>
      <div v-for="(attr, index) in localItem.attributes" :key="index" class="attribute-item">
        <select v-model="attr.visibility" @change="update">
          <option>public</option>
          <option>private</option>
          <option>protected</option>
          <option>package</option>
        </select>
        <input v-model="attr.name" @blur="update" placeholder="Name" />
        <span class="separator">:</span>
        <input v-model="attr.type" @blur="update" placeholder="Type" />
        <button @click="removeAttribute(index)" class="delete-btn" title="Remove Attribute">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M 10 2 L 9 3 L 4 3 L 4 5 L 20 5 L 20 3 L 15 3 L 14 2 L 10 2 z M 5 7 L 5 22 L 19 22 L 19 7 L 5 7 z M 8 9 L 10 9 L 10 20 L 8 20 L 8 9 z M 14 9 L 16 9 L 16 20 L 14 20 L 14 9 z"/>
          </svg>
        </button>
      </div>
      <button @click="addAttribute" class="add-btn">+ Add Attribute</button>
    </div>

    <div v-if="modelValue.type === 'Class' || modelValue.type === 'Interface'" class="properties-section">
      <h4>Methods</h4>
      <div v-for="(method, index) in localItem.methods" :key="index" class="method-item">
        <div class="method-main">
            <select v-model="method.visibility" @change="update">
              <option>public</option>
              <option>private</option>
              <option>protected</option>
              <option>package</option>
            </select>
            <input v-model="method.name" @blur="update" placeholder="Name" />
            <span class="params">({{ formatParams(method.parameters) }})</span>
            <span class="separator">:</span>
            <input v-model="method.returnType" @blur="update" placeholder="Return" />
        </div>
        <button @click="removeMethod(index)" class="delete-btn" title="Remove Method">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M 10 2 L 9 3 L 4 3 L 4 5 L 20 5 L 20 3 L 15 3 L 14 2 L 10 2 z M 5 7 L 5 22 L 19 22 L 19 7 L 5 7 z M 8 9 L 10 9 L 10 20 L 8 20 L 8 9 z M 14 9 L 16 9 L 16 20 L 14 20 L 14 9 z"/>
          </svg>
        </button>
      </div>
      <button @click="addMethod" class="add-btn">+ Add Method</button>
    </div>

    <!-- Connections & Multiplicity -->
    <div v-if="connections.length > 0" class="properties-section">
        <h4>Connections</h4>
        <div v-for="conn in connections" :key="conn.id" class="connection-item">
            <div class="conn-name">{{ getConnectedItemName(conn) }}</div>
            <div class="multiplicity-group">
                <input 
                    v-model="conn.sourceMultiplicity" 
                    @blur="updateConnection(conn)" 
                    :disabled="conn.to === localItem.id" 
                    placeholder="src"
                />
                <span>..</span>
                <input 
                    v-model="conn.targetMultiplicity" 
                    @blur="updateConnection(conn)" 
                    :disabled="conn.from === localItem.id" 
                    placeholder="tgt"
                />
            </div>
        </div>
    </div>

  </div>
</template>

<style scoped>
.properties-panel {
  padding: 15px;
  border-left: 1px solid #ccc;
  width: 350px;
  background-color: #f8f9fa;
  display: flex;
  flex-direction: column;
  gap: 15px;
  overflow-y: auto;
}
.panel-header {
  text-align: center;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 10px;
}
.panel-header h3 {
  margin: 0;
  font-size: 1.2em;
}
.item-type {
  font-size: 0.9em;
  color: #6c757d;
}
.form-section, .properties-section {
  background-color: #fff;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #dee2e6;
}
label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
  font-size: 0.9em;
}
.checkbox-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    font-weight: normal;
}
.checkbox-label input {
    width: auto;
}
input, select {
  width: 100%;
  padding: 6px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 0.9em;
}

.properties-section h4 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 1.1em;
}

.property-item, .attribute-item, .method-item, .connection-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 5px;
}
.key-input { flex: 1; }
.value-input { flex: 2; }

.attribute-item select {
  flex-basis: 100px;
  flex-grow: 0;
}
.attribute-item input {
  flex-grow: 1;
}

.method-item {
    flex-wrap: wrap;
}

.method-main {
    display: flex;
    align-items: center;
    gap: 5px;
    width: calc(100% - 30px);
}

.method-main select {
    flex-basis: 100px;
    flex-grow: 0;
}

.method-main input {
    flex-grow: 1;
}

.method-main .params {
    font-size: 0.9em;
    color: #495057;
}

.separator {
  font-weight: bold;
}

.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
}
.delete-btn:hover {
  background-color: #e9ecef;
  border-radius: 50%;
}
.delete-btn svg {
  fill: #dc3545;
}

.add-btn {
  width: 100%;
  padding: 8px;
  margin-top: 10px;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.add-btn:hover {
  background-color: #218838;
}

.connection-item {
    justify-content: space-between;
}
.conn-name {
    font-weight: bold;
}
.multiplicity-group {
    display: flex;
    gap: 4px;
    align-items: center;
}
.multiplicity-group input {
    width: 60px;
}
</style>