import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import Konva from 'vue-konva';
import router from './router';

const app = createApp(App);

app.use(router);
app.use(Konva);

app.mount('#app')
