<script setup lang="ts">
import { defineProps, defineEmits, ref, watch, nextTick } from 'vue';

const props = defineProps({
  modelValue: Object
});

const emit = defineEmits(['update:modelValue']);

const localItem = ref<any>({});

watch(() => props.modelValue, (newItem) => {
  // Create a deep copy to avoid direct mutation
  localItem.value = JSON.parse(JSON.stringify(newItem));
}, { deep: true, immediate: true });

const update = () => {
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
    <h3>{{ modelValue.type }} Properties</h3>
    
    <div>
      <label>Instance Name:</label>
      <input v-model="localItem.instanceName" @input="update" />
    </div>

    <hr>

    <h4>Fields</h4>
    <div v-for="(prop, index) in localItem.properties" :key="index" class="property-item">
      <input v-model="prop.key" @input="update" placeholder="Key" />
      <input v-model="prop.value" @input="update" placeholder="Value" />
      <button @click="removeProperty(index)">X</button>
    </div>
    <button @click="addProperty" class="add-btn">+ Add Field</button>

  </div>
</template>

<style scoped>
.properties-panel {
  padding: 15px;
  border-left: 1px solid #ccc;
  width: 250px;
  background-color: #f7f7f7;
}
label {
  display: block;
  margin-top: 10px;
  font-weight: bold;
}
input {
  width: 100%;
  padding: 5px;
  margin-top: 5px;
  box-sizing: border-box;
}
hr {
  margin: 20px 0;
  border: 0;
  border-top: 1px solid #ddd;
}
.property-item {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
}
.property-item input {
  width: 40%;
  margin-right: 5px;
}
.property-item button {
  width: 15%;
  background-color: #ff4d4d;
  color: white;
  border: none;
  cursor: pointer;
}
.add-btn {
  width: 100%;
  padding: 8px;
  margin-top: 10px;
  background-color: #4caf50;
  color: white;
  border: none;
  cursor: pointer;
}
</style>
