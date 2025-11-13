import { createRouter, createWebHistory } from 'vue-router';
import BoardListView from './views/BoardListView.vue';
import BoardView from './views/BoardView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'board-list',
      component: BoardListView
    },
    {
      path: '/board/:boardId(.*)', // Allow slashes in the boardId parameter
      name: 'board-view',
      component: BoardView
    }
  ]
});

export default router;
