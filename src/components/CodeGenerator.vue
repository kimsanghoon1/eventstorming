<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

const prompt = ref('');
const apiKey = ref('');
const isLoading = ref(false);
const error = ref<string | null>(null);

const generateCode = async () => {
  if (!prompt.value || !apiKey.value) {
    error.value = 'Please provide a prompt and your API key.';
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    const response = await axios.post(
      '/api/generate-code',
      {
        prompt: prompt.value,
        apiKey: apiKey.value,
      },
      {
        responseType: 'blob',
      }
    );

    const blob = new Blob([response.data], { type: 'application/zip' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'generated-code.zip';
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
  <div class="code-generator-view">
    <div class="container">
      <h2>AI Code Generator (Clean Architecture)</h2>
      <p>Describe the application or component you want to build. The AI will generate the code and provide it as a downloadable Zip file.</p>
      
      <div class="form-group">
        <label for="api-key">Gemini API Key</label>
        <input id="api-key" type="password" v-model="apiKey" placeholder="Enter your Gemini API Key" />
      </div>

      <div class="form-group">
        <label for="prompt">Prompt</label>
        <textarea 
          id="prompt"
          v-model="prompt"
          rows="10"
          placeholder="e.g., Create a simple CRUD API for a 'Product' entity in Express.js with in-memory storage. Include basic validation."
        ></textarea>
      </div>

      <button @click="generateCode" :disabled="isLoading">
        <span v-if="isLoading">Generating...</span>
        <span v-else>Generate & Download Zip</span>
      </button>

      <div v-if="error" class="error-message">
        <p>{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.code-generator-view {
  padding: 2rem;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
  background-color: #f8f9fa;
}

.container {
  width: 100%;
  max-width: 800px;
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

h2 {
  text-align: center;
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

input,
textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1rem;
  font-family: inherit;
}

button {
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

button:not(:disabled):hover {
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
</style>
