<script setup lang="ts">
import { defineProps, defineEmits, ref, watch, nextTick, computed } from 'vue';
import { store } from '../store';
import type { CanvasItem } from "../types";

const props = defineProps({
  modelValue: Object as () => CanvasItem
});

const emit = defineEmits(['update:modelValue']);

const localItem = ref<any>({});
const umlBoards = ref<string[]>([]);

const getUmlBoards = async () => {
  const response = await fetch('/api/boards');
  const allBoards = await response.json();
  const umlBoardsData = [];
  for (const boardName of allBoards) {
    const res = await fetch(`/api/boards/${boardName}`);
    const data = await res.json();
    if (!Array.isArray(data) && data.boardType === 'UML') {
      umlBoardsData.push(boardName);
    }
  }
  umlBoards.value = umlBoardsData;
};

watch(() => props.modelValue, (newItem) => {
  localItem.value = JSON.parse(JSON.stringify(newItem));
  if (newItem && newItem.type === 'Aggregate') {
    getUmlBoards();
  }
  if (newItem.type === 'Command') {
    if (!localItem.value.httpMethod) {
      localItem.value.httpMethod = 'GET';
    }
    if (!localItem.value.apiPath) {
      localItem.value.apiPath = '/';
    }
  }
}, { deep: true, immediate: true });

const connectedItems = computed(() => {
  const items: { key: string, value: string }[] = [];
  if (!props.modelValue) return [];

  if (props.modelValue.type === 'Aggregate' && props.modelValue.children) {
    props.modelValue.children.forEach(childId => {
      const child = store.canvasItems.find(i => i.id === childId);
      if (child) {
        items.push({ key: `Child (${child.type})`, value: child.instanceName });
      }
    });
  }

  if (props.modelValue.type === 'Event' && props.modelValue.connectedPolicies) {
    props.modelValue.connectedPolicies.forEach(policyId => {
      const policy = store.canvasItems.find(i => i.id === policyId);
      if (policy) {
        items.push({ key: 'Connected Policy', value: policy.instanceName });
      }
    });
  }

  if (props.modelValue.type === 'Policy' && props.modelValue.connectedEvents) {
    props.modelValue.connectedEvents.forEach(eventId => {
      const event = store.canvasItems.find(i => i.id === eventId);
      if (event) {
        items.push({ key: 'Connected Event', value: event.instanceName });
      }
    });
  }

  return items;
});

const update = () => {
  localItem.value.width = Number(localItem.value.width) || 0;
  localItem.value.height = Number(localItem.value.height) || 0;
  nextTick(() => {
    emit('update:modelValue', localItem.value);
  });
};

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
  localItem.value.attributes.push('');
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
  localItem.value.methods.push('');
  update();
};

const removeMethod = (index: number) => {
  localItem.value.methods.splice(index, 1);
  update();
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

    <div class="size-inputs form-section">
      <div>
        <label>Width:</label>
        <input type="number" v-model="localItem.width" @blur="update" />
      </div>
      <div>
        <label>Height:</label>
        <input type="number" v-model="localItem.height" @blur="update" />
      </div>
    </div>

    <div v-if="modelValue.type === 'Command'" class="form-section">
      <div>
        <label>HTTP Method:</label>
        <select v-model="localItem.httpMethod" @change="update">
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>DELETE</option>
          <option>PATCH</option>
        </select>
      </div>
      <div style="margin-top: 10px;">
        <label>API Path:</label>
        <input v-model="localItem.apiPath" @blur="update" />
      </div>
    </div>

    <div v-if="connectedItems.length > 0" class="properties-section">
      <h4>Connected</h4>
      <div v-for="(prop, index) in connectedItems" :key="index" class="property-item">
        <input :value="prop.key" class="key-input" disabled />
        <span class="separator">:</span>
        <input :value="prop.value" class="value-input" disabled />
      </div>
    </div>

    <div class="properties-section">
      <h4>Fields</h4>
      <div v-for="(prop, index) in localItem.properties" :key="index" class="property-item">
        <input v-model="prop.key" @blur="update" placeholder="Key" class="key-input" />
        <span class="separator">:</span>
        <input v-model="prop.value" @blur="update" placeholder="Value" class="value-input" />
        <button @click="removeProperty(index)" class="delete-btn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M 10 2 L 9 3 L 4 3 L 4 5 L 20 5 L 20 3 L 15 3 L 14 2 L 10 2 z M 5 7 L 5 22 L 19 22 L 19 7 L 5 7 z M 8 9 L 10 9 L 10 20 L 8 20 L 8 9 z M 14 9 L 16 9 L 16 20 L 14 20 L 14 9 z"/>
          </svg>
        </button>
      </div>
      <button @click="addProperty" class="add-btn">+ Add Field</button>
    </div>

    <div v-if="modelValue.type === 'Class' || modelValue.type === 'Interface'" class="properties-section">
      <h4>Attributes</h4>
      <div v-for="(attr, index) in localItem.attributes" :key="index" class="property-item">
        <input v-model="localItem.attributes[index]" @blur="update" placeholder="Attribute" class="value-input" />
        <button @click="removeAttribute(index)" class="delete-btn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M 10 2 L 9 3 L 4 3 L 4 5 L 20 5 L 20 3 L 15 3 L 14 2 L 10 2 z M 5 7 L 5 22 L 19 22 L 19 7 L 5 7 z M 8 9 L 10 9 L 10 20 L 8 20 L 8 9 z M 14 9 L 16 9 L 16 20 L 14 20 L 14 9 z"/>
          </svg>
        </button>
      </div>
      <button @click="addAttribute" class="add-btn">+ Add Attribute</button>
    </div>

    <div v-if="modelValue.type === 'Class' || modelValue.type === 'Interface'" class="properties-section">
      <h4>Methods</h4>
      <div v-for="(method, index) in localItem.methods" :key="index" class="property-item">
        <input v-model="localItem.methods[index]" @blur="update" placeholder="Method" class="value-input" />
        <button @click="removeMethod(index)" class="delete-btn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M 10 2 L 9 3 L 4 3 L 4 5 L 20 5 L 20 3 L 15 3 L 14 2 L 10 2 z M 5 7 L 5 22 L 19 22 L 19 7 L 5 7 z M 8 9 L 10 9 L 10 20 L 8 20 L 8 9 z M 14 9 L 16 9 L 16 20 L 14 20 L 14 9 z"/>
          </svg>
        </button>
      </div>
      <button @click="addMethod" class="add-btn">+ Add Method</button>
    </div>

    <div v-if="modelValue.type === 'Aggregate'" class="form-section">
      <label>UML Diagram:</label>
      <select v-model="localItem.umlDiagram" @change="update">
        <option :value="null">None</option>
        <option v-for="board in umlBoards" :key="board" :value="board">{{ board }}</option>
      </select>
    </div>

  </div>
</template>

<style scoped>
.properties-panel {
  padding: 15px;
  border-left: 1px solid #ccc;
  width: 280px;
  background-color: #f8f9fa;
  display: flex;
  flex-direction: column;
  gap: 15px;
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
input, select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  box-sizing: border-box;
}
input:disabled {
  background-color: #e9ecef;
  opacity: 1;
  cursor: not-allowed;
}
.size-inputs {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.properties-section h4 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 1.1em;
}
.property-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 5px;
}
.key-input { flex: 1; }
.separator { font-weight: bold; }
.value-input { flex: 2; }

.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
}
.delete-btn:hover {
  background-color: #e9ecef;
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
</style>