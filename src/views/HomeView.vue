<template>
  <div class="home">
    <h1>Выбор методики расчета выбросов</h1>
    <div class="methods-grid">
      <MethodCard
        v-for="method in methods"
        :key="method.id"
        :title="method.title"
        :description="method.description"
        :route="method.route"
        :icon="method.icon"
      />
    </div>
  </div>
</template>

<script setup>
import MethodCard from '../components/MethodCard.vue'
import { ref } from 'vue'

const methods = ref([
  {
    id: 1,
    title: 'Бензогенератор',
    description: 'Расчет выбросов от бензогенератора',
    route: '/gasoline-generator',
    icon: '⚡'
  },
  {
    id: 2,
    title: 'Резервуары',
    description: 'Расчет выбросов от резервуаров',
    route: '/reservoirs',
    icon: '🛢️'
  },
  {
    id: 3,
    title: 'Обработка металлов',
    description: 'Расчет выбросов при механической обработке металлов',
    route: '/during-metal-machining',
    icon: '⚒️'
  },
  {
    id: 4,
    title: 'Сварочные работы',
    description: 'Расчет выбросов при сварочных работах',
    route: '/during-welding-operations',
    icon: '🔧'
  },
  {
    id: 5,
    title: 'Точечный источник',
    description: 'Расчет выбросов от одиночного точечного источника',
    route: '/maximum-single',
    icon: '📍'
  },
  {
    id: 6,
    title: 'Движущийся транспорт',
    description: 'Расчет выбросов от движущегося автотранспорта',
    route: '/vehicle-flow',
    icon: '🚗'
  },
  {
    id: 7,
    title: 'Стоящий транспорт',
    description: 'Расчет выбросов от автотранспорта в районе регулируемого перекрестка',
    route: '/traffic-light-queue',
    icon: '🚦'
  },
  {
    id: 8,
    title: 'Открытый склад угля',
    description: 'Расчет выбросов от открытых складов угля',
    route: '/open-coal-warehouse',
    icon: '🏭'
  }
])
</script>

<style scoped>
.home {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

h1 {
  text-align: center;
  margin-bottom: 40px;
  color: #2c3e50;
}

.methods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  padding: 20px;
}
</style>