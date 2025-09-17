<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { store } from '../store';
import { useRouter } from 'vue-router';

const newBoardName = ref('');
const newBoardType = ref('Eventstorming');
const router = useRouter();

onMounted(() => {
  store.fetchBoards();
});

const createBoard = () => {
  if (newBoardName.value.trim()) {
    store.createNewBoard(newBoardName.value, newBoardType.value as any);
    newBoardName.value = '';
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
      </div>
    </header>

    <main class="board-grid">
      <div v-if="store.boards.length === 0" class="no-boards-message">
        <p>No boards found. Create your first board to get started!</p>
      </div>
      <div v-for="board in store.boards" :key="board.name" class="board-card">
        <div class="card-delete-button" @click.stop="store.deleteBoard(board.name)" title="Delete board">×</div>
        <div class="card-content" @click="selectBoard(board.name)">
          <img v-if="board.snapshotUrl" :src="board.snapshotUrl" alt="Board Snapshot" class="card-snapshot"/>
          <div v-else class="card-snapshot-placeholder">No Snapshot</div>
          <div class="card-info">
            <h3 class="card-title">{{ board.name }}</h3>
            <p class="card-date">Last saved: {{ formatDate(board.savedAt) }}</p>
            <p class="card-type">({{ board.type }})</p>
          </div>
        </div>
      </div>
    </main>
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
</style>