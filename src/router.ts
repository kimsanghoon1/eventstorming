import { createRouter, createWebHistory } from 'vue-router';
import BoardListView from './views/BoardListView.vue';
import BoardView from './views/BoardView.vue';
import LoginView from './views/LoginView.vue';
import { userStore } from './stores/userStore';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/',
      name: 'board-list',
      component: BoardListView,
      meta: { requiresAuth: true }
    },
    {
      path: '/board/:boardId(.*)', // Allow slashes in the boardId parameter
      name: 'board-view',
      component: BoardView,
      meta: { requiresAuth: true }
    }
  ]
});

router.beforeEach(async (to, from, next) => {
  // Initialize user store if not already done (e.g. on page refresh)
  if (userStore.loading) {
    await userStore.initialize();
  }

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);

  if (requiresAuth && !userStore.user) {
    next('/login');
  } else if (to.path === '/login' && userStore.user) {
    next('/');
  } else {
    next();
  }
});

export default router;
