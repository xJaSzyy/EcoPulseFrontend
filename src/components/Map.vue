<template>
  <div class="map-wrapper">
    <div ref="mapRoot" class="fullscreen-map"></div>

    <div class="layer-panel">
      <h3>Слои</h3>
      <label>
        <input
            type="checkbox"
            v-model="layersState.single.visible"
            @change="toggleLayer('single')"
        />
        Котельные
      </label>
      <label>
        <input
            type="checkbox"
            v-model="layersState.vehicleFlow.visible"
            @change="toggleLayer('vehicleFlow')"
        />
        Дороги
      </label>
      <label>
        <input
            type="checkbox"
            v-model="layersState.vehicleQueue.visible"
            @change="toggleLayer('vehicleQueue')"
        />
        Перекрестки
      </label>

      <button class="create-btn" @click="startCreateModeFlow">
        Создать линию
      </button>
      <button class="create-btn" @click="startCreateModeQueue">
        Создать точку
      </button>
    </div>

    <div class="legend">
      <div class="legend-title">Уровни загрязнения</div>
      <div
          v-for="level in levels"
          :key="level.label"
          class="legend-item"
      >
        <span
            class="legend-color"
            :style="{ backgroundColor: level.color }"
        />
        <span class="legend-label">{{ level.label }}</span>
      </div>
    </div>
  </div>

  <WeatherInfo
      v-if="weather"
      :temperature="weather.temperature"
      :icon-class="weather.iconClass"
      :wind-speed="weather.windSpeed"
      :wind-direction="weather.windDirection"
  />

  <SimulationPanel
      :startData="simulationStartData"
      v-if="showSimulationPanel"
      @buildSimulation="buildSimulation"
      @close="closeSimulationPanel"
  />
</template>

<script setup>
import {onMounted, reactive, ref} from 'vue'
import 'ol/ol.css'
import {defaults as defaultControls} from 'ol/control'
import Map from 'ol/Map'
import {fromLonLat, toLonLat} from 'ol/proj'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'

import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import {LineString, Point, Polygon} from 'ol/geom'
import Feature from 'ol/Feature'
import {Circle as CircleStyle, Fill, Icon, Stroke, Style} from 'ol/style'
import {Text as TextStyle} from 'ol/style';
import Modify from 'ol/interaction/Modify';

import {
  calculateSingleDangerZones, calculateSingleDangerZone, calculateVehicleFlowDangerZones,
  calculateTrafficLightQueueDangerZones
} from '../api/dangerZone.js';
import {getCurrentWeather} from '../api/weather.js';
import {
  addTrafficLightQueueEmissionSource,
  addVehicleFlowEmissionSource,
  getSingleEmissionSourceById, updateVehicleFlowEmissionSource
} from '../api/emissionSource.js';
import boilerIcon from '../icons/boiler.png';
import WeatherInfo from "../components/WeatherInfo.vue";
import SimulationPanel from '../components/SimulationPanel.vue'
import {asArray} from "ol/color";
import {altKeyOnly, singleClick} from 'ol/events/condition';

const mapRoot = ref(null)
const map = ref(null)
const weather = ref(null)
const showSimulationPanel = ref(false)
const simulationStartData = ref(null)

const createModeFlow = ref(false)
const createModeQueue = ref(false)
const createPoints = ref([])
const modifyFlow = ref(null);

const olLayers = reactive({
  single: null,
  vehicleFlow: null,
  vehicleQueue: null
})

const layersState = reactive({
  single: {visible: false},
  vehicleFlow: {visible: true},
  vehicleQueue: {visible: false}
})

const levels = [
  {max: 9.0, color: 'rgba(171, 209, 98, 1)', label: 'Очень низкий'},
  {max: 35.4, color: 'rgba(248, 212, 97, 1)', label: 'Низкий'},
  {max: 55.4, color: 'rgba(251, 153, 86, 1)', label: 'Средний'},
  {max: 125.4, color: 'rgba(246, 104, 106, 1)', label: 'Высокий'},
  {max: 225.4, color: 'rgba(164, 125, 184, 1)', label: 'Очень высокий'},
  {max: 9999, color: 'rgba(138, 79, 163, 1)', label: 'Экстремальный'}
]

function startCreateModeFlow() {
  createModeFlow.value = true
  createPoints.value = []
}

function startCreateModeQueue() {
  createModeQueue.value = true
}

async function handleTwoPointsSelected(p1, p2) {
  await addVehicleFlowEmissionSource({
    points: [
      { lon: p1[0], lat: p1[1] },
      { lon: p2[0], lat: p2[1] },
    ],
    vehicleType: 1,
    maxTrafficIntensity: 35,
    averageSpeed: 40,
  });

  await updateVehicleFlowLayer();
}

async function buildSimulation(data) {
  const dangerZone = await calculateSingleDangerZone({
    pollutant: 2,
    ejectedTemp: data.ejectedTemp,
    airTemp: data.airTemp,
    avgExitSpeed: data.avgExitSpeed,
    heightSource: data.heightSource,
    diameterSource: data.diameterSource,
    tempStratificationRatio: data.tempStratificationRatio,
    sedimentationRateRatio: data.sedimentationRateRatio,
    windSpeed: data.windSpeed,
    distance: 10000,
  });

  dangerZone.emissionSourceId = data.emissionSourceId;
  dangerZone.lon = data.lon;
  dangerZone.lat = data.lat;
  dangerZone.angle = data.windDirection;

  const singleLayer = olLayers.single;
  const source = singleLayer.getSource();

  const featuresToRemove = source.getFeatures().filter(f => {
    return f.get('emissionSourceId') === dangerZone.emissionSourceId;
  });

  source.removeFeatures(featuresToRemove);

  const ellipse = createEllipse(dangerZone);
  ellipse.set('emissionSourceId', dangerZone.emissionSourceId);
  source.addFeature(ellipse);

  const pointFeature = new Feature({
    geometry: new Point(fromLonLat([dangerZone.lon, dangerZone.lat])),
    type: 'boiler'
  });
  pointFeature.set('emissionSourceId', dangerZone.emissionSourceId);
  source.addFeature(pointFeature);
}

async function updateVehicleFlowLayer() {
  const vehicleFlowDangerZones = await calculateVehicleFlowDangerZones();

  const layer = olLayers.vehicleFlow;
  if (!layer) return;

  const source = layer.getSource();
  if (!source) return;

  source.clear();

  vehicleFlowDangerZones.forEach(dz => {
    const coords = dz.points.map(p => fromLonLat([p.lon, p.lat]));

    const lineFeature = new Feature({
      geometry: new LineString(coords),
      type: 'flow'
    });

    lineFeature.set('dangerColor', dz.color);
    lineFeature.set('emissionSourceId', dz.emissionSourceId);

    source.addFeature(lineFeature);
  });

  layer.changed();
}


async function updateVehicleQueueLayer() {
  const vehicleQueueDangerZones = await calculateTrafficLightQueueDangerZones();

  const newLayer = createVehicleQueueLayer(vehicleQueueDangerZones);
  const newSource = newLayer.getSource();

  const layer = olLayers.vehicleQueue;
  layer.setSource(newSource);
}

async function closeSimulationPanel() {
  await buildSimulation(simulationStartData.value);
  showSimulationPanel.value = false;
  simulationStartData.value = null;
}

function createEllipse(dangerZone) {
  const semiMajor = dangerZone.length;
  const semiMinor = dangerZone.width;

  const center = fromLonLat([dangerZone.lon, dangerZone.lat]);

  const angle = 0.5 * Math.PI - (dangerZone.angle * Math.PI) / 180;

  const points = [];

  const offsetX = (semiMajor / 1.25) * Math.cos(angle);
  const offsetY = (semiMajor / 1.25) * Math.sin(angle);
  const shiftedCenter = [center[0] + offsetX, center[1] + offsetY];

  for (let i = 360; i >= 0; i -= 15) {
    const theta = (i * Math.PI) / 180;
    const x = semiMajor * Math.cos(theta);
    const y = semiMinor * Math.sin(theta);

    const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
    const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);

    points.push([shiftedCenter[0] + rotatedX, shiftedCenter[1] + rotatedY]);
  }
  points.push(points[0]);

  const ellipseFeature = new Feature({
    geometry: new Polygon([points]),
  });

  ellipseFeature.set('dangerData', dangerZone);
  ellipseFeature.set('emissionSourceId', dangerZone.emissionSourceId);
  ellipseFeature.set('dangerColor', dangerZone.color);

  return ellipseFeature;
}

function getColorWithAlpha(baseColor, alpha = 0.75) {
  if (!baseColor) {
    return [0, 0, 0, alpha];
  }

  return Array.isArray(baseColor)
      ? [baseColor[0], baseColor[1], baseColor[2], alpha]
      : asArray(baseColor).slice(0, 3).concat(alpha);
}

function createSingleLayer(dangerZones) {
  const singleSource = new VectorSource()

  dangerZones.forEach(dangerZone => {
    const ellipse = createEllipse(dangerZone);
    ellipse.set('emissionSourceId', dangerZone.emissionSourceId);
    singleSource.addFeature(ellipse);

    const pointFeature = new Feature({
      geometry: new Point(fromLonLat([dangerZone.lon, dangerZone.lat])),
      type: 'boiler'
    })
    pointFeature.set('dangerColor', dangerZone.color);
    pointFeature.set('emissionSourceId', dangerZone.emissionSourceId);

    singleSource.addFeature(pointFeature)
  })

  const pointStyle = new Style({
    image: new Icon({
      src: boilerIcon,
      scale: 0.05,
      anchor: [0.5, 1],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction'
    })
  });

  const ellipseStyle = new Style({
    fill: new Fill({
      color: 'black'
    }),
    stroke: new Stroke({
      color: 'rgba(0, 0, 0, 0.5)'
    })
  });

  return new VectorLayer({
    source: singleSource,
    visible: false,
    style: feature => {
      const geom = feature.getGeometry();
      const color = getColorWithAlpha(feature.get('dangerColor'), 0.6);

      if (geom.getType() === 'Polygon') {
        ellipseStyle.getFill().setColor(color);
        return ellipseStyle;
      }

      if (geom.getType() === 'Point') {
        return pointStyle;
      }

      return null;
    }

  });
}

function createVehicleFlowLayer(dangerZones) {
  const vehicleFlowSource = new VectorSource();

  dangerZones.forEach(dz => {
    const coords = dz.points.map(p => fromLonLat([p.lon, p.lat]));

    const lineFeature = new Feature({
      geometry: new LineString(coords),
      type: 'flow'
    });
    lineFeature.set('dangerColor', dz.color);
    lineFeature.set('emissionSourceId', dz.emissionSourceId);

    vehicleFlowSource.addFeature(lineFeature);
  });


  const lineStyle = new Style({
    stroke: new Stroke({
      color: 'black',
      width: 5,
    }),
  });

  const pointStyle = new Style({
    image: new CircleStyle({
      radius: 3,
      fill: new Fill({color: 'black'}),
      stroke: new Stroke({
        color: 'rgba(0, 0, 0, 0.5)',
      })
    })
  });

  return new VectorLayer({
    source: vehicleFlowSource,
    visible: true,
    style: feature => {
      const geomType = feature.getGeometry().getType();
      const color = getColorWithAlpha(feature.get('dangerColor'), 0.75);

      if (geomType === 'LineString') {
        lineStyle.getStroke().setColor(color);
        return lineStyle;
      }

      if (geomType === 'Point') {
        pointStyle.getImage().getFill().setColor(color);
        return pointStyle;
      }

      return null;
    }
  });
}

function createVehicleQueueLayer(dangerZones) {
  const vehicleQueueSource = new VectorSource()

  dangerZones.forEach(dangerZone => {
    const pointFeature = new Feature({
      geometry: new Point(fromLonLat([dangerZone.location.lon, dangerZone.location.lat])),
      type: 'queue'
    })
    pointFeature.set('dangerColor', dangerZone.color);
    pointFeature.set('emissionSourceId', dangerZone.emissionSourceId);

    vehicleQueueSource.addFeature(pointFeature)
  })

  return new VectorLayer({
    source: vehicleQueueSource,
    visible: false,
    style: feature => {
      const geomType = feature.getGeometry().getType();
      const color = getColorWithAlpha(feature.get('dangerColor'), 0.75);
      const emissionSourceId = feature.get('emissionSourceId');

      if (geomType === 'Point') {
        return new Style({
          image: new CircleStyle({
            radius: 5,
            fill: new Fill({color: color}),
            stroke: new Stroke({
              color: 'rgba(0, 0, 0, 0.5)',
            })
          }),
          /*text: new TextStyle({
            text: emissionSourceId,
            font: '12px Arial, sans-serif',
            fill: new Fill({ color: '#000000' }),
            offsetY: 0,
            overflow: true
          })*/
        });
      }

      return null;
    }
  });
}

function createLayers(singleDangerZones, vehicleFlowDangerZones, vehicleQueueDangerZones) {
  const singleLayer = createSingleLayer(singleDangerZones);
  const vehicleFlowLayer = createVehicleFlowLayer(vehicleFlowDangerZones);
  const vehicleQueueLayer = createVehicleQueueLayer(vehicleQueueDangerZones);

  olLayers.single = singleLayer;
  olLayers.vehicleFlow = vehicleFlowLayer;
  olLayers.vehicleQueue = vehicleQueueLayer;

  return {singleLayer, vehicleFlowLayer, vehicleQueueLayer};
}

onMounted(async () => {
  const baseLayer = new TileLayer({
    source: new OSM()
  })

  const currentWeather = await getCurrentWeather();
  weather.value = {
    temperature: currentWeather.temperature,
    iconClass: currentWeather.iconClass,
    windSpeed: currentWeather.windSpeed,
    windDirection: currentWeather.windDirection,
  }

  const singleDangerZones = await calculateSingleDangerZones({
    pollutant: 2, // solid particles
    airTemp: currentWeather.temperature,
    windSpeed: currentWeather.windSpeed,
    windDirection: currentWeather.windDirection
  });

  const vehicleFlowDangerZones = await calculateVehicleFlowDangerZones();

  const vehicleQueueDangerZones = await calculateTrafficLightQueueDangerZones();

  const {
    singleLayer,
    vehicleFlowLayer,
    vehicleQueueLayer
  } = createLayers(singleDangerZones, vehicleFlowDangerZones, vehicleQueueDangerZones);

  map.value = new Map({
    target: mapRoot.value,
    layers: [baseLayer, singleLayer, vehicleFlowLayer, vehicleQueueLayer],
    view: new View({
      center: fromLonLat([86.0833, 55.3333]),
      zoom: 12
    }),
    controls: defaultControls({
      zoom: false
    })
  })

  map.value.on('singleclick', async (evt) => {
    const pixel = evt.pixel;

    let found = null;

    map.value.forEachFeatureAtPixel(pixel, (feature) => {
      if (feature.getGeometry().getType() === 'Polygon') {
        const dangerData = feature.get('dangerData');
        if (dangerData) {
          found = dangerData;
        }
      }
    });

    if (createModeFlow.value) {
      const coord3857 = evt.coordinate
      const [lon, lat] = toLonLat(coord3857)

      createPoints.value.push([lon, lat])

      if (createPoints.value.length === 2) {
        const [p1, p2] = createPoints.value
        await handleTwoPointsSelected(p1, p2)

        createModeFlow.value = false
        createPoints.value = []
      }

      return
    }

    if (createModeQueue.value) {
      const coord3857 = evt.coordinate
      const [lon, lat] = toLonLat(coord3857)

      await addTrafficLightQueueEmissionSource({
        location: {
          lon: lon,
          lat: lat
        },
        vehicleType: 1,
        vehiclesCount: randomInt(1, 5),
        trafficLightCycles: 12,
        trafficLightStopTime: 60
      })

      await updateVehicleQueueLayer()

      createModeQueue.value = false

      return
    }

    if (showSimulationPanel.value && found == null) {
      await closeSimulationPanel();
    } else if (found != null) {
      if (simulationStartData.value != null) {
        await closeSimulationPanel();
      }

      showSimulationPanel.value = true;

      const emissionSource = await getSingleEmissionSourceById(found.emissionSourceId);

      simulationStartData.value = {
        emissionSourceId: emissionSource.id,
        lon: emissionSource.location.lon,
        lat: emissionSource.location.lat,
        ejectedTemp: emissionSource.ejectedTemp,
        airTemp: weather.value.temperature,
        avgExitSpeed: emissionSource.avgExitSpeed,
        heightSource: emissionSource.heightSource,
        diameterSource: emissionSource.diameterSource,
        windSpeed: weather.value.windSpeed,
        windDirection: weather.value.windDirection,
        tempStratificationRatio: emissionSource.tempStratificationRatio,
        sedimentationRateRatio: emissionSource.sedimentationRateRatio,
      }
    }
  });

  const mf = new Modify({
    source: vehicleFlowLayer.getSource(),
    filter: feature => feature.getGeometry().getType() === 'LineString',
  });

  mf.on('modifyend', async evt => {
    const feature = evt.features.item(0);
    if (!feature) return;

    const geom = feature.getGeometry();
    const coords = geom.getCoordinates();

    const emissionSourceId = feature.get('emissionSourceId');
    const points = coords.map(c => {
      const [lon, lat] = toLonLat(c);
      return { lon, lat };
    });

    await updateVehicleFlowEmissionSource({ id: emissionSourceId, points: points });
    await updateVehicleFlowLayer();
  });

  map.value.addInteraction(mf);
  modifyFlow.value = mf;
})

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const toggleLayer = key => {
  if (!olLayers[key]) return;

  const visible = layersState[key].visible;
  olLayers[key].setVisible(visible);

  if (key === 'vehicleFlow' && modifyFlow.value) {
    modifyFlow.value.setActive(visible);
  }
};
</script>

<style>
.map-wrapper {
  position: relative;
}

.fullscreen-map {
  width: 100%;
  height: 100vh;
}

.layer-panel {
  position: absolute;
  top: 24px;
  left: 24px;
  padding: 8px 12px;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  font-size: 14px;
}

.layer-panel h3 {
  margin: 0 0 4px;
  font-size: 14px;
}

.layer-panel label {
  display: block;
}

.layer-panel .create-btn {
  margin-top: 8px;
  width: 100%;
  padding: 6px 8px;
  font-size: 14px;
  cursor: pointer;
}

.legend {
  position: absolute;
  left: 24px;
  bottom: 24px;
  background: rgba(255, 255, 255, 0.9);
  padding: 8px 10px;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  font-size: 12px;
  z-index: 10;
}

.legend-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.legend-item {
  display: flex;
  align-items: center;
  margin: 2px 0;
}

.legend-color {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  margin-right: 6px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

</style>