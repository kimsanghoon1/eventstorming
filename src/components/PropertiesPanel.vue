<script setup lang="ts">
import { defineProps, defineEmits, ref, watch, nextTick } from 'vue';

const props = defineProps({
  modelValue: Object
});

const emit = defineEmits(['update:modelValue']);

const localItem = ref<any>({});

watch(() => props.modelValue, (newItem) => {
  localItem.value = JSON.parse(JSON.stringify(newItem));
}, { deep: true, immediate: true });

const update = () => {
  // Ensure numeric values for width and height
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
input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  box-sizing: border-box;
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