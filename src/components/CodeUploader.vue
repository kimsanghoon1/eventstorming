<template>
  <div>
    <input type="file" @change="handleFileUpload" accept=".zip" />
    <button @click="uploadCode" >Upload and Reverse Engineer</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { store } from '../store';

const selectedFile = ref<File | null>(null);

const handleFileUpload = (event) => {
  selectedFile.value = event.target.files[0];
};

const uploadCode = async () => {
  // if (selectedFile.value) {
    try {
      await store.reverseEngineerCode(selectedFile.value);
      alert('Code successfully analyzed and model loaded!');
    } catch (error) {
      alert('Error analyzing code: ' + error.message);
    }
  // }
};
</script>
