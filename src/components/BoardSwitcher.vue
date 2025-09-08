<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { store } from '../store';

const newBoardName = ref('');
const newBoardType = ref('Eventstorming');
const isDropdownOpen = ref(false);

onMounted(() => {
  store.fetchBoards();
});

const createBoard = () => {
  if (newBoardName.value.trim()) {
    store.createNewBoard(newBoardName.value, newBoardType.value as any);
    newBoardName.value = '';
    isDropdownOpen.value = false;
  }
};

const activeBoardDisplayName = computed(() => {
  if (store.activeBoard) {
    const board = store.boards.find(b => b.name === store.activeBoard);
    return board ? `${board.name} (${board.type})` : 'Select a board';
  }
  return 'Select a board';
});

const switchBoard = (name: string) => {
  store.loadBoard(name);
  isDropdownOpen.value = false;
};

</script>

<template>
  <div class="switcher-container">
    <div class="dropdown">
      <button @click="isDropdownOpen = !isDropdownOpen" class="dropdown-toggle">
        {{ activeBoardDisplayName }}
      </button>
      <div v-if="isDropdownOpen" class="dropdown-menu">
        <div
          v-for="board in store.boards"
          :key="board.name"
          class="dropdown-item"
          :class="{ active: board.name === store.activeBoard }"
          @click="switchBoard(board.name)"
        >
          <span>{{ board.name }} ({{ board.type }})</span>
          <button @click.stop="store.deleteBoard(board.name)" class="delete-btn">x</button>
        </div>
        <hr v-if="store.boards.length > 0"/>
        <div class="new-board-actions">
          <p>Create new board:</p>
          <input v-model="newBoardName" @keyup.enter="createBoard" placeholder="New board name..." />
          <select v-model="newBoardType">
            <option value="Eventstorming">Eventstorming</option>
            <option value="UML">UML</option>
          </select>
          <button @click="createBoard">+ Create</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.switcher-container {
  padding: 8px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  align-items: center;
  height: 50px;
}

.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-toggle {
  background-color: #fff;
  border: 1px solid #ced4da;
  border-radius: .25rem;
  padding: .375rem .75rem;
  font-size: 1rem;
  line-height: 1.5;
  cursor: pointer;
  min-width: 220px;
  text-align: left;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dropdown-toggle::after {
  content: '▼';
  font-size: 12px;
  margin-left: 10px;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  display: block;
  min-width: 100%;
  background-color: #fff;
  border: 1px solid rgba(0,0,0,.15);
  border-radius: .25rem;
  box-shadow: 0 .5rem 1rem rgba(0,0,0,.175);
  padding: .5rem 0;
  margin-top: .125rem;
}

.dropdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: .5rem 1rem;
  cursor: pointer;
  white-space: nowrap;
}

.dropdown-item:hover {
  background-color: #f1f1f1;
}

.dropdown-item.active {
  background-color: #007bff;
  color: white;
}

.delete-btn {
  background: #dc3545;
  color: white;
  border: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  cursor: pointer;
  line-height: 18px;
  text-align: center;
  font-size: 11px;
  margin-left: 10px;
}

hr {
  margin: .5rem 0;
  border-color: #e9ecef;
}

.new-board-actions {
  padding: .5rem 1rem;
}

.new-board-actions p {
    margin: 0 0 5px 0;
    font-size: 0.9rem;
    color: #6c757d;
}

.new-board-actions input,
.new-board-actions select,
.new-board-actions button {
  width: 100%;
  box-sizing: border-box;
  padding: .375rem .75rem;
  margin-bottom: 5px;
  border: 1px solid #ced4da;
  border-radius: .25rem;
}

.new-board-actions button {
  background-color: #28a745;
  color: white;
  cursor: pointer;
}
</style>
