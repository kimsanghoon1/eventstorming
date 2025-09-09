<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { store } from '../store';

const isLoading = ref(false);
const error = ref<string | null>(null);

const generateCode = async () => {
  if (!store.activeBoard) {
    error.value = 'Please select an active board first.';
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    const response = await axios.post(
      '/api/generate-code',
      {
        boardName: store.activeBoard,
      },
      {
        responseType: 'blob',
      }
    );

    const blob = new Blob([response.data], { type: 'application/zip' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${store.activeBoard}-code.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

  } catch (err: any) {
    const errorMessage = await err.response?.data?.text();
    error.value = `Failed to generate code: ${errorMessage || err.message}`;
    console.error(err);
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="dialog-overlay" @click.self="store.toggleCodeGenerator(false)">
    <div class="dialog-content">
      <button class="close-button" @click="store.toggleCodeGenerator(false)">×</button>
      <h2>AI Code Generator</h2>
      <p>The AI will generate a complete Java project based on the current diagram and provide it as a Zip file.</p>

      <button @click="generateCode" :disabled="isLoading">
        <span v-if="isLoading">Generating...</span>
        <span v-else>Generate & Download Zip</span>
      </button>

      <div v-if="error" class="error-message">
        <p>{{ error }}</p>
      </div>

      <div class="notice">
        <p><strong>Note:</strong> This tool sends the name of your current board to the server to generate code.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog-content {
  position: relative;
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 600px;
}

.close-button {
  position: absolute;
  top: 10px;
  right: 10px;
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
}

h2 {
  text-align: center;
  margin-top: 0;
  margin-bottom: 0.5rem;
}

p {
  text-align: center;
  margin-bottom: 2rem;
  color: #6c757d;
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
}

input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}

button:not(.close-button) {
  width: 100%;
  padding: 0.85rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

button:not(.close-button):not(:disabled):hover {
  background-color: #0056b3;
}

.error-message {
  margin-top: 1.5rem;
  color: #dc3545;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  padding: 1rem;
  border-radius: 4px;
  text-align: center;
}

.notice {
    margin-top: 1.5rem;
    padding: 1rem;
    background-color: #e9ecef;
    border-radius: 4px;
    font-size: 0.9rem;
    color: #495057;
}
</style>