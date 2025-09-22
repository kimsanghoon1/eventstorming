<template>
  <div>
    <input type="file" @change="handleFileUpload" accept=".zip" />
    <button @click="uploadCode">Upload and Reverse Engineer</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { store } from '../store';
import { useRouter } from 'vue-router';

const router = useRouter();
const selectedFile = ref<File | null>(null);

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files) {
    selectedFile.value = target.files[0];
  }
};

const uploadCode = async () => {
  // if (selectedFile.value) {
    try {
      const { eventstormingBoardName, umlBoardNames } = await store.reverseEngineerCode(selectedFile.value);
      alert(`Code successfully analyzed!\n\nCreated Eventstorming board:\n- ${eventstormingBoardName}\n\nCreated UML boards:\n- ${umlBoardNames.join('\n- ')}`);
      router.push({ name: 'BoardView', params: { boardName: eventstormingBoardName } });
    } catch (error: any) {
      alert('Error analyzing code: ' + error.message);
    }
  // }
};
</script>
