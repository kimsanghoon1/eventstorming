<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from '@/store';
import MainCanvas from '@/components/MainCanvas.vue';
import PropertiesPanel from '@/components/PropertiesPanel.vue';
import type { Connection } from '../types';
import type { CanvasItem } from '@/types/canvas';

const store = useStore();
const route = useRoute();
const router = useRouter();

const boardId = Array.isArray(route.params.boardId) ? route.params.boardId.join('/') : route.params.boardId;
const boardName = computed(() => {
  if (!boardId) return 'Unknown Board';
  const parts = boardId.split('/');
  return parts[parts.length - 1].replace('.json', '');
});

const selectedItem = computed(() => store.selectedItem);

// --- Highlighting Logic ---
const highlightedItemIds = ref(new Set<number>());
const clickedItemId = ref<number | null>(null);

const showLlmModal = ref(false);
const llmPrompt = ref('');
const isSubmittingLlmPrompt = ref(false);
const llmError = ref<string | null>(null);
const llmInfoMessage = ref<string | null>(null);
const llmResultBanner = ref<string | null>(null);
const llmBannerTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const dismissLlmResultBanner = () => {
  if (llmBannerTimer.value) {
    clearTimeout(llmBannerTimer.value);
    llmBannerTimer.value = null;
  }
  llmResultBanner.value = null;
};
const showSuccessToast = ref(false);

const getDownstreamItemIds = (itemId: number, connections: readonly Connection[]): Set<number> => {
  const downstreamIds = new Set<number>();
  const queue: number[] = [itemId];
  const visited = new Set<number>([itemId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
    connections.forEach(conn => {
      if (conn.from === currentId && !visited.has(conn.to)) {
        downstreamIds.add(conn.to);
        visited.add(conn.to);
        queue.push(conn.to);
      }
    });

    const currentItem = store.getItemById(currentId);
    const producedEventId = (currentItem?.type === 'Command' || currentItem?.type === 'Policy') ? currentItem.producesEventId : null;
    if (producedEventId && !visited.has(producedEventId)) {
      downstreamIds.add(producedEventId);
      visited.add(producedEventId);
      queue.push(producedEventId);
    }
  }
  return downstreamIds;
};

const handleItemClick = (itemId: number) => {
  clickedItemId.value = itemId;
  highlightedItemIds.value = getDownstreamItemIds(itemId, store.reactiveConnections);
};

const handleItemDblClick = (item: CanvasItem) => {
  store.setSelectedItem(item);
  if (!llmResultBanner.value) {
    llmResultBanner.value = `'${item.instanceName}' 선택됨`;
    if (llmBannerTimer.value) {
      clearTimeout(llmBannerTimer.value);
    }
    llmBannerTimer.value = setTimeout(() => {
      llmBannerTimer.value = null;
      llmResultBanner.value = null;
    }, 3000);
  }
};

const clearHighlight = () => {
  clickedItemId.value = null;
  highlightedItemIds.value = new Set();
  store.setSelectedItem(null);
};
// --- End Highlighting Logic ---


onMounted(() => {
  store.loadBoard(boardId);
});

onUnmounted(() => {
  store.unloadBoard();
});

const goBack = () => {
  router.push('/');
};

const openLlmModal = () => {
  llmPrompt.value = '';
  llmError.value = null;
  llmInfoMessage.value = null;
  showLlmModal.value = true;
};

const closeLlmModal = () => {
  if (isSubmittingLlmPrompt.value) return;
  showLlmModal.value = false;
};

const triggerLlmAction = async (prompt: string, successMessagePrefix: string = 'LLM 요청이 완료되었습니다.') => {
  if (!boardId) {
    llmError.value = '보드 식별자를 찾을 수 없습니다.';
    return;
  }
  const boardPayload = store.getSerializableBoardData();
  if (!boardPayload) {
    llmError.value = '보드 데이터를 읽어올 수 없습니다. 저장 후 다시 시도해주세요.';
    return;
  }

  isSubmittingLlmPrompt.value = true;
  llmError.value = null;
  llmInfoMessage.value = null;

  try {
    const response = await fetch(`/api/boards/${boardId}/llm-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt.trim(),
        boardData: boardPayload,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || result.message || '요청에 실패했습니다.');
    }

    llmInfoMessage.value = result.message || successMessagePrefix;

    if (result.updatedBoard) {
      store.applyBoardData(result.updatedBoard);
      const { added, updated } = store.recentChangeSummary;
      const summaryParts: string[] = [];
      if (added) summaryParts.push(`추가 ${added}개`);
      if (updated) summaryParts.push(`수정 ${updated}개`);
      llmResultBanner.value = summaryParts.length
        ? `${successMessagePrefix} (${summaryParts.join(', ')})`
        : `${successMessagePrefix} (변경 사항 없음)`;
      
      if (llmBannerTimer.value) {
        clearTimeout(llmBannerTimer.value);
      }
      llmBannerTimer.value = setTimeout(() => {
        llmBannerTimer.value = null;
        llmResultBanner.value = null;
      }, 6000);
      showLlmModal.value = false;
    }
    
    // Handle generated code link if present (assuming backend returns it in result)
    if (result.downloadLink) {
       // Create a temporary link to download
       const link = document.createElement('a');
       link.href = result.downloadLink;
       link.download = ''; // Browser handles filename
       document.body.appendChild(link);
       link.click();
       document.body.removeChild(link);
       llmResultBanner.value = "소스코드 생성이 완료되었습니다. 다운로드가 시작됩니다.";
    }

  } catch (error: any) {
    console.error('Failed to submit LLM prompt:', error);
    llmError.value = error.message || '알 수 없는 오류가 발생했습니다.';
  } finally {
    isSubmittingLlmPrompt.value = false;
  }
};

const submitLlmPrompt = async () => {
  if (!llmPrompt.value.trim()) {
    llmError.value = '요청 내용을 입력해주세요.';
    return;
  }
  await triggerLlmAction(llmPrompt.value, 'LLM 수정 완료');
};

const generateProjectCode = async () => {
  if (!confirm('전체 프로젝트에 대한 소스코드를 생성하시겠습니까?')) return;
  // We send a specific prompt that the Orchestrator will recognize as a code generation request.
  // The Orchestrator looks for keywords like "generate code", "java", "spring".
  // We also mention the project name to be safe, though the boardId implies it.
  await triggerLlmAction(`Generate Java Spring Boot source code for the entire project '${boardName.value}'.`, '소스코드 생성 완료');
};

const handleGenerateCode = async (item: CanvasItem) => {
  if (!confirm(`'${item.instanceName}' 컨텍스트에 대한 소스코드를 생성하시겠습니까?`)) return;
  // Send a context-specific prompt
  await triggerLlmAction(`Generate Java Spring Boot source code for the '${item.instanceName}' context only.`, '소스코드 생성 완료');
};

const handleGenerateUml = async (item: CanvasItem) => {
  if (!confirm(`'${item.instanceName}' 컨텍스트에 대한 UML을 생성하시겠습니까?`)) return;
  // Send a UML generation prompt
  await triggerLlmAction(`Generate UML class diagram for the '${item.instanceName}' context only.`, 'UML 생성 완료');
};

const handleOpenUml = (umlFilename: string) => {
  store.openUmlDiagram(umlFilename);
};
</script>

<template>
  <div class="board-view-container bg-background-light dark:bg-background-dark text-gray-900 dark:text-white">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/20 backdrop-blur-sm">
      <div class="flex items-center gap-4">
        <button @click="goBack" class="flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
        </button>
        <h1 class="text-xl font-bold tracking-tight">{{ boardName }}</h1>
      </div>
      
      <div class="flex items-center gap-2">
        <button @click="store.undo()" title="Undo (Ctrl+Z)" class="flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5,8C9.85,8 7.45,9 5.6,10.6L2,7V16H11L7.38,12.38C8.77,11.22 10.54,10.5 12.5,10.5C16.04,10.5 19.05,12.81 20.1,16L22.47,15.22C21.08,11.03 17.15,8 12.5,8Z" /></svg>
        </button>
        <button @click="store.redo()" title="Redo (Ctrl+Y)" class="flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4,10.6C16.55,9 14.15,8 11.5,8C6.85,8 2.92,11.03 1.54,15.22L3.9,16C4.95,12.81 7.95,10.5 11.5,10.5C13.45,10.5 15.23,11.22 16.62,12.38L13,16H22V7L18.4,10.6Z" /></svg>
        </button>
        
        <div class="w-px h-6 bg-gray-300 dark:bg-white/10"></div>
        
        <button @click="store.saveActiveBoard()" title="Save Board (Ctrl+S)" class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors font-medium">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17,3H5C3.89,3 3,3.9 3,5V19C3,20.1 3.9,21 5,21H19C20.1,21 21,20.1 21,19V7L17,3M19,19H5V5H16.17L19,7.83V19M12,12C10.34,12 9,13.34 9,15C9,16.66 10.34,18 12,18C13.66,18 15,16.66 15,15C15,13.34 13.66,12 12,12M6,6H15V10H6V6Z" /></svg>
          <span>Save</span>
        </button>
        <button @click="generateProjectCode" title="Generate Source Code" class="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors font-medium">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z" /></svg>
          <span>Code</span>
        </button>
        <button @click="openLlmModal" title="Request LLM Update" class="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors font-medium">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M2 5a2 2 0 012-2h9a2 2 0 012 2v1h.5A2.5 2.5 0 0118 8.5V10h2a2 2 0 012 2v5a2 2 0 01-2 2h-6a2 2 0 01-2-2v-1H9.5A2.5 2.5 0 017 13.5V12H4a2 2 0 01-2-2V5zm11 8a1 1 0 011-1h6a1 1 0 011 1v4h-8v-4zm-9-6v3h6V7H4zm10-1H4V5h10v1z" /></svg>
          <span>LLM Update</span>
        </button>
      </div>
    </div>
    
    <div v-if="llmResultBanner" class="flex items-center justify-between px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
      <span class="text-blue-900 dark:text-blue-100 font-medium">{{ llmResultBanner }}</span>
      <button type="button" class="text-blue-900 dark:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-800 rounded p-1 transition-colors" @click="dismissLlmResultBanner" aria-label="변경 알림 닫기">×</button>
    </div>
    <div class="board-content">
      <MainCanvas 
        :highlightedItemIds="highlightedItemIds" 
        :clickedItemId="clickedItemId" 
        @item-click="handleItemClick" 
        @item-dblclick="handleItemDblClick"
        @canvas-click="clearHighlight" 
      />
      <PropertiesPanel 
        v-if="store.selectedItem" 
        :selectedItem="store.selectedItem"
        @generate-code="handleGenerateCode"
        @generate-uml="handleGenerateUml"
        @open-uml="handleOpenUml"
      />
    </div>
  </div>

    <div v-if="showLlmModal" class="modal-overlay">
      <div class="modal-content llm-modal">
        <button class="close-modal" @click="closeLlmModal" :disabled="isSubmittingLlmPrompt">×</button>
        <h2>LLM 수정 요청</h2>
        <p>현재 보드 상태와 함께 원하는 변경 사항을 입력하면 LLM이 새 모델을 생성해 적용합니다.</p>
        <textarea
          v-model="llmPrompt"
          placeholder="예: 고객 등록 이후 2단계 인증 단계를 추가해줘."
          rows="6"
        ></textarea>
        <div v-if="llmError" class="error-message modal-error">{{ llmError }}</div>
        <div v-if="llmInfoMessage" class="info-message modal-info">{{ llmInfoMessage }}</div>
        <div class="modal-actions">
          <button class="secondary-btn" @click="closeLlmModal" :disabled="isSubmittingLlmPrompt">
            취소
          </button>
          <button class="primary-btn" @click="submitLlmPrompt" :disabled="isSubmittingLlmPrompt">
            <span v-if="!isSubmittingLlmPrompt">LLM에 보내기</span>
            <span v-else class="spinner"></span>
          </button>
        </div>
    </div>
  </div>
</template>

<style scoped>
.board-view-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.board-content {
  display: flex;
  flex-grow: 1;
  overflow: hidden;
  position: relative;
}

.llm-modal textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.75rem;
  font-size: 1rem;
  resize: vertical;
}

.close-modal {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: transparent;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
}

.info-message {
  background-color: #eef2ff;
  color: #312e81;
  border: 1px solid #c7d2fe;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-top: 1rem;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.modal-content {
  background-color: #fff;
  padding: 2rem;
  border-radius: 0.75rem;
  width: 90%;
  max-width: 640px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-content h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.modal-content p {
  margin: 0;
  color: #475569;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 0.5rem;
}

.primary-btn,
.secondary-btn {
  border-radius: 0.5rem;
  padding: 0.65rem 1.4rem;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.primary-btn {
  background-color: #4f46e5;
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 130px;
}

.primary-btn:disabled {
  background-color: #a5b4fc;
  cursor: not-allowed;
}

.secondary-btn {
  background-color: white;
  border-color: #cbd5e1;
  color: #334155;
}

.secondary-btn:hover:not(:disabled) {
  background-color: #f1f5f9;
}

.spinner {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: white;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column; /* This is to contain MainCanvas correctly */
  position: relative; /* Needed for MainCanvas to fill the space */
  min-width: 0; /* Important for flex-shrink to work correctly */
}
</style>
