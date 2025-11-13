<script setup lang="ts">
import { store } from '../store';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const boards = computed(() => store.boards);

const selectBoard = (boardName: string) => {
  router.push(`/board/${boardName}`);
};
</script>

<template>
  <div class="board-switcher">
    <div class="header">
        <h2 class="title">My Boards</h2>
        <!-- Add New Board functionality can be re-added here -->
    </div>
    <div class="board-list">
      <div 
        v-for="board in boards" 
        :key="board.instanceName"
        class="board-card"
        @click="selectBoard(board.instanceName)"
      >
        <div class="card-image-wrapper">
          <img v-if="board.snapshotUrl" :src="board.snapshotUrl" :alt="board.instanceName" class="card-image" />
          <div v-else class="card-image-placeholder">No Preview</div>
        </div>
        <div class="card-content">
          <h3 class="card-title">{{ board.instanceName }}</h3>
          <p class="card-type">{{ board.type }}</p>
          <p class="card-date">{{ new Date(board.savedAt).toLocaleString() }}</p>
        </div>
        <button class="delete-board-btn" @click.stop="store.deleteBoard(board.instanceName)">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-switcher {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
}

.title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-heading);
}

.board-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.board-card {
  background-color: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
  position: relative;
}

.board-card:hover {
  border-color: #42b983;
  transform: translateY(-4px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

.board-card.active {
  border-color: #42b983;
  box-shadow: 0 0 0 2px #42b983;
}

.card-image-wrapper {
  height: 180px;
  background-color: var(--color-background-mute);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-image-placeholder {
  color: var(--color-text);
  opacity: 0.5;
  font-size: 1rem;
}

.card-content {
  padding: 1rem;
}

.card-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--color-heading);
  margin: 0 0 0.5rem 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-type {
  font-size: 0.8rem;
  background-color: var(--color-background-mute);
  color: var(--color-text);
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
  margin: 0 0 0.75rem 0;
}

.card-date {
  font-size: 0.8rem;
  color: var(--color-text);
  opacity: 0.7;
  margin: 0;
}

.delete-board-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.board-card:hover .delete-board-btn {
  opacity: 1;
}

.delete-board-btn:hover {
  background: #ff6b6b;
}

.delete-board-btn svg {
  width: 18px;
  height: 18px;
}
</style>