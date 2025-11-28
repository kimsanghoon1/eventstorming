<template>
  <div class="test-page">
    <h1>CanvasData 분리 구조 테스트</h1>
    
    <div class="status">
      <p>Board ID: {{ boardId }}</p>
      <p>연결 상태: {{ isConnected ? '✅ 연결됨' : '❌ 연결 안됨' }}</p>
      <p>Canvas Items: {{ enrichedItems.length }}</p>
      <p>Loading: {{ loading }}</p>
    </div>

    <button @click="initialize">초기화</button>
    <button @click="createTestItem">테스트 아이템 생성</button>

    <div class="items-list">
      <h2>Canvas Items</h2>
      <div v-for="item in enrichedItems" :key="item.id" class="item-card">
        <h3>{{ item.domain?.instanceName || 'Loading...' }}</h3>
        <p>Type: {{ item.domain?.type }}</p>
        <p>Position: ({{ item.x }}, {{ item.y }})</p>
        <p>Size: {{ item.width }} x {{ item.height }}</p>
        <button @click="moveItem(item.id)">이동</button>
        <button @click="updateItem(item.id)">수정</button>
        <button @click="deleteItem(item.id)">삭제</button>
      </div>
    </div>

    <div v-if="error" class="error">
      Error: {{ error.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useBoardData } from '../composables/useBoardData';

const boardId = ref('sample-eventstorming.json');
const board = useBoardData(boardId.value);

const { enrichedItems, isConnected, loading, error, initialize, createItem, updateItemPosition, updateItemDomain, deleteItem, cleanup } = board;

const createTestItem = async () => {
  try {
    await createItem({
      type: 'EVENT',
      instanceName: `TestEvent_${Date.now()}`,
      description: '테스트 이벤트',
      x: Math.random() * 500,
      y: Math.random() * 500,
      width: 120,
      height: 60,
    });
    console.log('Item created successfully');
  } catch (e) {
    console.error('Failed to create item:', e);
  }
};

const moveItem = (id: string) => {
  updateItemPosition(id, {
    x: Math.random() * 500,
    y: Math.random() * 500,
  });
};

const updateItem = async (id: string) => {
  await updateItemDomain(id, {
    description: `Updated at ${new Date().toLocaleTimeString()}`,
  });
};

const deleteItemHandler = async (id: string) => {
  if (confirm('정말 삭제하시겠습니까?')) {
    await deleteItem(id);
  }
};

onMounted(async () => {
  console.log('Initializing board...');
  await initialize();
  console.log('Board initialized');
});

onUnmounted(() => {
  cleanup();
});
</script>

<style scoped>
.test-page {
  padding: 20px;
  font-family: Arial, sans-serif;
}

.status {
  background: #f0f0f0;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.status p {
  margin: 5px 0;
}

button {
  padding: 8px 16px;
  margin-right: 10px;
  margin-bottom: 10px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background: #45a049;
}

.items-list {
  margin-top: 20px;
}

.item-card {
  background: white;
  border: 1px solid #ddd;
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.item-card h3 {
  margin-top: 0;
  color: #333;
}

.item-card p {
  margin: 5px 0;
  color: #666;
}

.item-card button {
  background: #2196F3;
  font-size: 12px;
  padding: 6px 12px;
}

.item-card button:last-child {
  background: #f44336;
}

.error {
  background: #ffebee;
  color: #c62828;
  padding: 15px;
  border-radius: 8px;
  margin-top: 20px;
}
</style>
