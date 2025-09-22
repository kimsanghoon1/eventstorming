<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { store } from '../store';
import { useRouter } from 'vue-router';

const newBoardName = ref('');
const newBoardType = ref('Eventstorming');
const router = useRouter();
const isMigrateDialogOpen = ref(false);
const selectedFile = ref<File | null>(null);

onMounted(() => {
  store.fetchBoards();
});

const createBoard = () => {
  if (newBoardName.value.trim()) {
    store.createNewBoard(newBoardName.value, newBoardType.value as any);
    newBoardName.value = '';
  }
};

const openMigrateDialog = () => {
  isMigrateDialogOpen.value = true;
};

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files) {
    selectedFile.value = target.files[0];
  }
};

const uploadAndReverseEngineer = async () => {
  if (selectedFile.value) {
    try {
      const { eventstormingBoardName, umlBoardNames } = await store.reverseEngineerCode(selectedFile.value);
      alert(`Code successfully analyzed!\n\nCreated Eventstorming board:\n- ${eventstormingBoardName}\n\nCreated UML boards:\n- ${umlBoardNames.join('\n- ')}`);
      isMigrateDialogOpen.value = false;
      selectedFile.value = null;
      store.fetchBoards(); // Refresh the board list
    } catch (error: any) {
      alert('Error analyzing code: ' + error.message);
    }
  }
};

const selectBoard = (boardName: string) => {
  router.push(`/board/${boardName}`);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('ko-KR', { 
    year: 'numeric', month: 'long', day: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });
};

</script>

<template>
  <div class="board-selector-container">
    <header class="selector-header">
      <h1>My Boards</h1>
      <div class="new-board-actions">
        <input v-model="newBoardName" @keyup.enter="createBoard" placeholder="New board name..." />
        <select v-model="newBoardType">
          <option value="Eventstorming">Eventstorming</option>
          <option value="UML">UML</option>
        </select>
        <button @click="createBoard">+ Create New Board</button>
        <button @click="openMigrateDialog" style="background-color: #28a745;">+ Migrate from Code</button>
      </div>
    </header>

    <main class="board-grid">
      <div v-if="store.boards.length === 0" class="no-boards-message">
        <p>No boards found. Create your first board to get started!</p>
      </div>
      <div v-for="board in store.boards" :key="board.instanceName" class="board-card">
        <div class="card-delete-button" @click.stop="store.deleteBoard(board.instanceName)" title="Delete board">×</div>
        <div class="card-content" @click="selectBoard(board.instanceName)">
          <img v-if="board.snapshotUrl" :src="board.snapshotUrl" alt="Board Snapshot" class="card-snapshot"/>
          <div v-else class="card-snapshot-placeholder">No Snapshot</div>
          <div class="card-info">
            <h3 class="card-title">{{ board.instanceName }}</h3>
            <p class="card-date">Last saved: {{ formatDate(board.savedAt) }}</p>
            <p class="card-type">({{ board.type }})</p>
          </div>
        </div>
      </div>
    </main>

    <!-- Migration Dialog -->
    <div v-if="isMigrateDialogOpen" class="dialog-overlay" @click.self="isMigrateDialogOpen = false">
      <div class="dialog-content">
        <button class="close-button" @click="isMigrateDialogOpen = false">×</button>
        <h2>Migrate from Code</h2>
        <p>Upload a ZIP file of your Java source code to reverse-engineer it into Eventstorming and UML models.</p>
        <div class="file-input-wrapper">
          <input type="file" @change="handleFileUpload" accept=".zip" id="file-upload" class="file-input"/>
          <label for="file-upload" class="file-label">
            <span v-if="selectedFile">{{ selectedFile.name }}</span>
            <span v-else>Choose a ZIP file...</span>
          </label>
        </div>
        <button @click="uploadAndReverseEngineer" :disabled="!selectedFile" class="upload-button">Upload and Reverse Engineer</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-selector-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f0f2f5;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background-color: #ffffff;
  border-bottom: 1px solid #dee2e6;
  flex-shrink: 0;
}

.selector-header h1 {
  margin: 0;
  font-size: 1.75rem;
  color: #343a40;
}

.new-board-actions {
  display: flex;
  gap: 0.5rem;
}

.new-board-actions input,
.new-board-actions select,
.new-board-actions button {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ced4da;
  border-radius: .25rem;
  font-size: 1rem;
}

.new-board-actions button {
  background-color: #007bff;
  color: white;
  cursor: pointer;
  border-color: #007bff;
}
.new-board-actions button:hover {
  background-color: #0056b3;
}

.board-grid {
  flex-grow: 1;
  overflow-y: auto;
  padding: 2rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.no-boards-message {
  width: 100%;
  grid-column: 1 / -1;
  text-align: center;
  margin-top: 5rem;
  color: #6c757d;
  font-size: 1.2rem;
}

.board-card {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.05);
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
}

.board-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 16px rgba(0,0,0,0.1);
}

.card-content {
  cursor: pointer;
}

.card-snapshot {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-bottom: 1px solid #e9ecef;
}

.card-snapshot-placeholder {
  width: 100%;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f8f9fa;
  color: #adb5bd;
  font-weight: bold;
  border-bottom: 1px solid #e9ecef;
}

.card-info {
  padding: 1rem;
}

.card-title {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: #212529;
}

.card-date {
  margin: 0;
  font-size: 0.875rem;
  color: #6c757d;
}

.card-type {
  margin: 0.25rem 0 0 0;
  font-size: 0.8rem;
  color: #adb5bd;
}

.card-delete-button {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background-color: rgba(0,0,0,0.5);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  line-height: 24px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.board-card:hover .card-delete-button {
  opacity: 1;
}

.card-delete-button:hover {
  background-color: #dc3545;
}

/* Dialog Styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  width: 90%;
  max-width: 500px;
  position: relative;
}

.close-button {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
}

.file-input-wrapper {
  margin: 1.5rem 0;
}

.file-input {
  display: none;
}

.file-label {
  display: block;
  padding: 1rem;
  border: 2px dashed #ced4da;
  border-radius: 4px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
}

.file-label:hover {
  border-color: #007bff;
}

.upload-button {
  width: 100%;
  padding: 0.75rem;
  font-size: 1rem;
}

.upload-button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}
</style>