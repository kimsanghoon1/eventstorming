import { createRouter, createWebHashHistory } from 'vue-router';
import BoardSwitcher from './components/BoardSwitcher.vue';
import MainCanvas from './components/MainCanvas.vue';

const routes = [
  {
    path: '/',
    name: 'BoardList',
    component: BoardSwitcher,
  },
  {
    path: '/board/:boardName',
    name: 'BoardView',
    component: MainCanvas,
    props: true, // Pass route.params to component props
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
