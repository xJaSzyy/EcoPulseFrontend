<template>
  <div class="map-wrapper">
    <div ref="mapRoot" class="fullscreen-map"></div>

    <div class="layer-panel">
      <h3>Слои</h3>
      <label>
        <input
            type="checkbox"
            v-model="layersState.singles.visible"
            @change="toggleLayer('singles')"
        />
        Котельные
      </label>
      <label>
        <input
            type="checkbox"
            v-model="layersState.vehicleFlows.visible"
            @change="toggleLayer('vehicleFlows')"
        />
        Дороги
      </label>
      <label>
        <input
            type="checkbox"
            v-model="layersState.vehicleQueues.visible"
            @change="toggleLayer('vehicleQueues')"
        />
        Перекрестки
      </label>
    </div>

    <WeatherInfo
        v-if="weather"
        :temperature="weather.temperature"
        :iconUrl="weather.iconUrl"
        :windSpeed="weather.windSpeed"
        :windDirection="weather.windDirection"
    />

    <div v-if="selectedDangerZone" class="danger-info">
      <p>Цвет: {{ selectedDangerZone.color }}</p>
      <p>Длина: {{ selectedDangerZone.length }} м</p>
      <p>Ширина: {{ selectedDangerZone.width }} м</p>
      <p>Угол: {{ selectedDangerZone.angle }}°</p>
    </div>
  </div>

  <SimulationPanel
      :startData="simulationStartData"
      v-if="showSimulationPanel"
      @buildSimulation="buildSimulation"
      @close="showSimulationPanel = false;"
  />
</template>

<script setup>
import {onMounted, reactive, ref} from 'vue'
import 'ol/ol.css'
import {defaults as defaultControls} from 'ol/control'
import Map from 'ol/Map'
import {fromLonLat} from 'ol/proj'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'

import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import {Point, Polygon} from 'ol/geom'
import Feature from 'ol/Feature'
import {Circle as CircleStyle, Fill, Icon, Style} from 'ol/style'

import {calculateDangerZones, calculateMaximumSingleDangerZone} from '../api/emission.js';
import {getCurrentWeather} from '../api/weather.js';
import {getEmissionSourceById} from '../api/emissionSource.js';
import boilerIcon from '../icons/boiler.png';
import WeatherInfo from "../components/WeatherInfo.vue";
import SimulationPanel from '../components/SimulationPanel.vue'

const mapRoot = ref(null)
const map = ref(null)
const weather = ref(null)
const selectedDangerZone = ref(null)
const showSimulationPanel = ref(false)
const simulationStartData = ref(null)

const olLayers = reactive({
  singles: null,
  vehicleFlows: null,
  vehicleQueues: null
})

const layersState = reactive({
  singles: { visible: true },
  vehicleFlows: { visible: false },
  vehicleQueues: { visible: false }
})

async function buildSimulation(data) {
  const dangerZone = await calculateMaximumSingleDangerZone({
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

  dangerZone.lon = data.lon;
  dangerZone.lat = data.lat;
  dangerZone.angle = data.windDirection;

  const dangerZones = [dangerZone]

  if (olLayers.singles) {
    map.value.removeLayer(olLayers.singles)
  }

  const singlesLayer = createSinglesLayer(dangerZones)
  olLayers.singles = singlesLayer
  map.value.addLayer(singlesLayer)
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

  ellipseFeature.setStyle(
      new Style({
        fill: new Fill({
          color: dangerZone.color,
        }),
      })
  );

  ellipseFeature.set('dangerData', dangerZone);

  return ellipseFeature;
}

function createSinglesLayer(dangerZones) {
  const singlesSource = new VectorSource()

  dangerZones.forEach(dangerZone => {
    const ellipse = createEllipse(dangerZone);
    singlesSource.addFeature(ellipse);

    const pointFeature = new Feature({
      geometry: new Point(fromLonLat([dangerZone.lon, dangerZone.lat])),
      type: 'boiler'
    })
    pointFeature.set('dangerColor', dangerZone.color);
    singlesSource.addFeature(pointFeature)
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
  });

  return new VectorLayer({
    source: singlesSource,
    visible: true,
    style: feature => {
      const geom = feature.getGeometry();
      const color = feature.get('dangerColor') || 'black';

      if (geom.getType() === 'Point') {
        return pointStyle;
      }

      if (geom.getType() === 'Polygon') {
        ellipseStyle.getFill().setColor(color);
        return ellipseStyle;
      }

      return null;
    }
  });
}

function createVehicleFlowsLayer() {
  const vehicleFlowsSource = new VectorSource()
  const vehicleFlowsFeature = new Feature({
    geometry: new Point(fromLonLat([86.028311, 55.349136]))
  })
  vehicleFlowsSource.addFeature(vehicleFlowsFeature)

  return new VectorLayer({
    source: vehicleFlowsSource,
    visible: false,
    style: new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({color: 'green'})
      })
    })
  });
}

function createVehicleQueuesLayer() {
  const vehicleQueuesSource = new VectorSource()
  const vehicleQueuesFeature = new Feature({
    geometry: new Point(fromLonLat([86.114142, 55.352852]))
  })
  vehicleQueuesSource.addFeature(vehicleQueuesFeature)

  return new VectorLayer({
    source: vehicleQueuesSource,
    visible: false,
    style: new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({color: 'blue'})
      })
    })
  });
}

function createLayers(dangerZones) {
  const singlesLayer = createSinglesLayer(dangerZones);
  const vehicleFlowsLayer = createVehicleFlowsLayer();
  const vehicleQueuesLayer = createVehicleQueuesLayer();

  olLayers.singles = singlesLayer;
  olLayers.vehicleFlows = vehicleFlowsLayer;
  olLayers.vehicleQueues = vehicleQueuesLayer;

  return { singlesLayer, vehicleFlowsLayer, vehicleQueuesLayer };
}

onMounted(async () => {
  const baseLayer = new TileLayer({
    source: new OSM()
  })

  const currentWeather = await getCurrentWeather();
  weather.value = {
    temperature: currentWeather.temperature,
    iconUrl: currentWeather.iconUrl,
    windSpeed: currentWeather.windSpeed,
    windDirection: currentWeather.windDirection,
  }

  const dangerZones = await calculateDangerZones({
    pollutant: 2, // solid particles
    airTemp: currentWeather.temperature,
    windSpeed: currentWeather.windSpeed,
    windDirection: currentWeather.windDirection
  });

  const {
    singlesLayer,
    vehicleFlowsLayer,
    vehicleQueuesLayer
  } = createLayers(dangerZones);

  map.value = new Map({
    target: mapRoot.value,
    layers: [baseLayer, singlesLayer, vehicleFlowsLayer, vehicleQueuesLayer],
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

    map.value.forEachFeatureAtPixel(pixel, (feature, layer) => {
      if (feature.getGeometry().getType() === 'Polygon') {
        const dangerData = feature.get('dangerData');
        if (dangerData) {
          found = dangerData;
        }
      }
    });

    showSimulationPanel.value = found != null;
    selectedDangerZone.value = found;

    if (showSimulationPanel.value) {
      const emissionSource = await getEmissionSourceById(found.emissionSourceId);

      simulationStartData.value = {
        lon: emissionSource.lon,
        lat: emissionSource.lat,
        ejectedTemp: emissionSource.ejectedTemp,
        airTemp: weather.value.temperature,
        avgExitSpeed: emissionSource.avgExitSpeed,
        heightSource: emissionSource.heightSource,
        diameterSource: emissionSource.diameterSource,
        windSpeed: weather.value.windSpeed,
        windDirection: weather.value.windDirection
      }
    }
  });
})

const toggleLayer = (key) => {
  if (!olLayers[key]) return
  olLayers[key].setVisible(layersState[key].visible)
}
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

.danger-info {
  position: absolute;
  bottom: 24px;
  left: 24px;
  background: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  font-size: 14px;
}

</style>