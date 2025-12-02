import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue')
  },
  {
    path: '/gasoline-generator',
    name: 'gasoline-generator',
    component: () => import('../views/GasolineGeneratorView.vue')
  },
  {
    path: '/reservoirs',
    name: 'reservoirs',
    component: () => import('../views/Reservoirs.vue')
  },
  {
    path: '/during-metal-machining',
    name: 'during-metal-machining',
    component: () => import('../views/DuringMetalMachining.vue')
  },
  {
    path: '/during-welding-operations',
    name: 'during-welding-operations',
    component: () => import('../views/DuringWeldingOperations.vue')
  },
  {
    path: '/maximum-single',
    name: 'maximum-single',
    component: () => import('../views/MaximumSingle.vue')
  },
  {
    path: '/vehicle-flow',
    name: 'vehicle-flow',
    component: () => import('../views/VehicleFlow.vue')
  },
  {
    path: '/traffic-light-queue',
    name: 'traffic-light-queue',
    component: () => import('../views/TrafficLightQueue.vue')
  },
  {
    path: '/open-coal-warehouse',
    name: 'open-coal-warehouse',
    component: () => import('../views/OpenCoalWarehouse.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router