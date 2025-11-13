<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import type { Board } from '@/types';
import axios from 'axios';

const items = ref<any[]>([]); // Can be Board or Folder
const router = useRouter();
const isLoading = ref(true);
const error = ref<string | null>(null);
const currentPath = ref('');

// --- New state for the modal ---
const showModal = ref(false);
const prompt = ref('I want to model a microservice architecture for an online shopping mall.');
const isCreatingModel = ref(false);
const creationError = ref<string | null>(null);

const parentPath = computed(() => {
  if (!currentPath.value) return null;
  const parts = currentPath.value.replace(/\\/g, '/').split('/');
  parts.pop();
  return parts.join('/');
});

const fetchItems = async () => {
  try {
    isLoading.value = true;
    error.value = null;
    const response = await fetch(`http://localhost:3000/api/boards?path=${encodeURIComponent(currentPath.value)}`);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    items.value = await response.json();
  } catch (err: any) {
    console.error('Failed to fetch items:', err);
    error.value = `Failed to load items. Is the server running? (${err.message})`;
  } finally {
    isLoading.value = false;
  }
};

const openBoard = (boardId: string) => {
  router.push({ name: 'board-view', params: { boardId } });
};

const navigateTo = (path: string) => {
  currentPath.value = path;
  fetchItems();
};

const deleteBoard = async (item: any) => {
    if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
        try {
            const response = await fetch(`http://localhost:3000/api/boards/${item.boardId}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error('Failed to delete the board.');
            }
            // Refresh the board list
            await fetchItems();
        } catch (err: any) {
            console.error('Error deleting board:', err);
            alert(`Error: ${err.message}`);
        }
    }
};


// --- New methods for creating a model ---
const openCreateModelModal = () => {
  prompt.value = 'I want to model a microservice architecture for an online shopping mall. The system should include services for user management (registration, login), product catalog (viewing products, categories), and order management (placing orders, viewing order history).';
  creationError.value = null;
  showModal.value = true;
};

const handleCreateModel = async () => {
  if (!prompt.value.trim()) {
    creationError.value = 'Prompt cannot be empty.';
    return;
  }
  isCreatingModel.value = true;
  creationError.value = null;
  try {
    const response = await axios.post('http://localhost:3000/api/create-model', {
      prompt: prompt.value,
    });
    if (response.status === 200) {
      showModal.value = false;
      await fetchItems(); // Refresh board list to show the new model
      alert('Model created successfully! The new board should now be in the list.');
    } else {
      throw new Error(response.data.error || 'Failed to create model.');
    }
  } catch (err: any) {
    console.error('Failed to create model:', err);
    creationError.value = `Error: ${err.response?.data?.details || err.message || 'An unknown error occurred.'}`;
  } finally {
    isCreatingModel.value = false;
  }
};


onMounted(fetchItems);
</script>

<template>
  <div class="board-list-view">
    <header class="header">
      <div class="header-left">
        <h1 v-if="!currentPath">My Boards</h1>
        <div v-else class="breadcrumbs">
          <button class="breadcrumb-btn" @click="navigateTo('')">Home</button>
          <span v-for="(part, index) in currentPath.split(/[\\/]/)" :key="index" class="breadcrumb-part">
            / {{ part }}
          </span>
        </div>
      </div>
      <button class="create-btn" @click="openCreateModelModal">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
        </svg>
        Create Model With LLM
      </button>
    </header>

    <div v-if="isLoading" class="loading">Loading boards...</div>
    <div v-if="error" class="error-message">{{ error }}</div>

    <div v-if="!isLoading && !error" class="board-grid">
      <!-- "Up" folder -->
      <div v-if="parentPath !== null" class="board-card folder-card" @click="navigateTo(parentPath!)">
        <div class="card-content">
          <div class="folder-icon">..</div>
          <div class="board-info">
            <h2 class="board-name">Up to parent</h2>
          </div>
        </div>
      </div>
      
      <div v-for="item in items" :key="item.id || item.name" class="board-card">
        <!-- Folder Card -->
        <div v-if="item.type === 'folder'" class="card-content folder-card" @click="navigateTo(item.path)">
          <div class="folder-icon">📁</div>
           <div class="board-info">
            <h2 class="board-name">{{ item.name }}</h2>
          </div>
        </div>

        <!-- Board Card -->
        <div v-else>
          <div class="card-content" @click="openBoard(item.boardId)">
            <img 
              :src="item.snapshotUrl ? `http://localhost:3000${item.snapshotUrl}` : '/No-Image-Placeholder.svg'" 
              alt="Board snapshot" 
              class="board-snapshot"
              @error="($event.target as HTMLImageElement).src = '/No-Image-Placeholder.svg'"
            />
            <div class="board-info">
              <h2 class="board-name">{{ item.name }}</h2>
              <p class="board-type">{{ item.type }}</p>
              <p class="board-date">Saved: {{ new Date(item.savedAt).toLocaleString() }}</p>
            </div>
          </div>
          <button class="delete-btn" @click.stop="deleteBoard(item)" title="Delete board">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
              <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- New Modal for Creating Model -->
  <div v-if="showModal" class="modal-overlay">
    <div class="modal-content">
      <h2>Create New Model with LLM</h2>
      <p>Enter a prompt describing the system you want to model. The orchestrator will generate an Eventstorming board and corresponding UML diagrams.</p>
      
      <textarea v-model="prompt" placeholder="e.g., I want to model an online library system..."></textarea>
      
      <div v-if="creationError" class="error-message modal-error">{{ creationError }}</div>

      <div class="modal-actions">
        <button class="secondary-btn" @click="showModal = false" :disabled="isCreatingModel">Cancel</button>
        <button class="primary-btn" @click="handleCreateModel" :disabled="isCreatingModel">
          <span v-if="!isCreatingModel">Generate</span>
          <span v-else class="spinner"></span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-list-view {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.header-left {
  display: flex;
  align-items: center;
}

.breadcrumbs {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-heading);
}

.breadcrumb-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  font-weight: 600;
  color: #4f46e5;
  cursor: pointer;
  padding: 0;
}
.breadcrumb-btn:hover {
  text-decoration: underline;
}
.breadcrumb-part {
  color: #64748b;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 1rem;
}

.header h1 {
  font-size: 2rem;
  font-weight: 600;
}

.create-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background-color: #4f46e5;
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}
.create-btn:hover {
  background-color: #4338ca;
}
.create-btn svg {
  width: 1.25rem;
  height: 1.25rem;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #64748b;
}

.error-message {
  background-color: #fef2f2;
  color: #b91c1c;
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid #fecaca;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.board-card {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  overflow: hidden;
  background-color: white;
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  position: relative;
}

.folder-card {
  cursor: pointer;
}

.folder-icon {
  font-size: 5rem;
  text-align: center;
  padding: 2rem 0;
  color: #94a3b8;
}

.board-card:hover {
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.card-content {
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
}

.board-snapshot {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 0.5rem;
}

.board-info {
  flex-grow: 1;
}

.board-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-heading);
  margin-bottom: 0.25rem;
}

.board-type {
  font-size: 0.875rem;
  color: #64748b;
  margin-bottom: 0.25rem;
}

.board-date {
  font-size: 0.75rem;
  color: #94a3b8;
}

.delete-btn {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.5rem;
  transition: background-color 0.2s;
}
.delete-btn:hover {
  background-color: #fef2f2;
}
.delete-btn svg {
  width: 1.25rem;
  height: 1.25rem;
  color: #ef4444;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  padding: 2rem;
  border-radius: 0.75rem;
  width: 90%;
  max-width: 720px;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.modal-content h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.modal-content p {
  color: #475569;
  margin-bottom: 1.5rem;
  text-align: center;
}
.modal-content textarea {
  width: 100%;
  min-height: 150px;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.75rem;
  font-family: inherit;
  font-size: 1rem;
  resize: vertical;
}
.modal-error {
    margin-top: 1rem;
}
.modal-actions {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}
.modal-actions button {
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}
.primary-btn {
  background-color: #4f46e5;
  color: white;
  min-width: 100px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.primary-btn:hover:not(:disabled) {
  background-color: #4338ca;
}
.primary-btn:disabled {
    background-color: #a5b4fc;
    cursor: not-allowed;
}
.secondary-btn {
  background-color: white;
  color: #475569;
  border-color: #cbd5e1;
}
.secondary-btn:hover:not(:disabled) {
  background-color: #f1f5f9;
}
.secondary-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

/* Spinner for loading state */
.spinner {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
</style>
