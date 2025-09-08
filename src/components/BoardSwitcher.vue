<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { store } from '../store';

const newBoardName = ref('');
const newBoardType = ref('Eventstorming');

onMounted(() => {
  store.fetchBoards();
});

const createBoard = () => {
  store.createNewBoard(newBoardName.value, newBoardType.value as any);
  newBoardName.value = '';
};

</script>

<template>
  <div class="board-switcher">
    <h4>Boards</h4>
    <div class="board-list">
      <div 
        v-for="board in store.boards" 
        :key="board.name"
        class="board-item"
        :class="{ active: board.name === store.activeBoard }"
      >
        <span @click="store.loadBoard(board.name)">{{ board.name }} ({{board.type}})</span>
        <button @click="store.deleteBoard(board.name)" class="delete-btn">x</button>
      </div>
    </div>
    <div class="board-actions">
      <input v-model="newBoardName" @keyup.enter="createBoard" placeholder="New board name..." />
      <select v-model="newBoardType">
        <option value="Eventstorming">Eventstorming</option>
        <option value="UML">UML</option>
      </select>
      <button @click="createBoard">+ Create</button>
    </div>
    <button @click="store.createTestObjects()" class="test-btn">Create 1000 Test Objects</button>
    <button @click="store.toggleView()" class="toggle-view-btn">{{ store.mainView === 'canvas' ? 'Show Code Generator' : 'Show Canvas' }}</button>
  </div>
</template>

<style scoped>
.board-switcher {
  padding: 15px;
  background-color: #e9ecef;
  border-bottom: 1px solid #ccc;
}
h4 {
  margin: 0 0 10px 0;
}
.board-list {
  margin-bottom: 15px;
}
.board-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  cursor: pointer;
}
.board-item:hover {
  background-color: #dee2e6;
}
.board-item.active {
  background-color: #007bff;
  color: white;
}
.board-item span {
  flex-grow: 1;
}
.delete-btn {
  background: #dc3545;
  color: white;
  border: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  line-height: 20px;
  text-align: center;
}
.board-actions {
  display: flex;
}
.board-actions input {
  flex-grow: 1;
  margin-right: 5px;
}
.save-all-btn {
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  background-color: #28a745;
  color: white;
  border: none;
}

.test-btn {
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  background-color: #ffc107;
  color: black;
  border: none;
  cursor: pointer;
}

.toggle-view-btn {
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  background-color: #17a2b8;
  color: white;
  border: none;
  cursor: pointer;
}
</style>