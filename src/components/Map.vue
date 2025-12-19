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
        :icon-class="weather.iconClass"
        :wind-speed="weather.windSpeed"
        :wind-direction="weather.windDirection"
    />
  </div>

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
import {fromLonLat} from 'ol/proj'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'

import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import {LineString, Point, Polygon} from 'ol/geom'
import Feature from 'ol/Feature'
import {Circle as CircleStyle, Fill, Icon, Stroke, Style} from 'ol/style'

import {calculateSingleDangerZones, calculateSingleDangerZone, calculateVehicleFlowDangerZones} from '../api/dangerZone.js';
import {getCurrentWeather} from '../api/weather.js';
import {getSingleEmissionSourceById} from '../api/emissionSource.js';
import boilerIcon from '../icons/boiler.png';
import WeatherInfo from "../components/WeatherInfo.vue";
import SimulationPanel from '../components/SimulationPanel.vue'
import {asArray} from "ol/color";

const mapRoot = ref(null)
const map = ref(null)
const weather = ref(null)
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

  const singlesLayer = olLayers.singles;
  const source = singlesLayer.getSource();

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
  });

  return new VectorLayer({
    source: singleSource,
    visible: true,
    style: feature => {
      const geom = feature.getGeometry();
      const baseColor = feature.get('dangerColor') || [0, 0, 0];
      const rgba = Array.isArray(baseColor)
          ? [baseColor[0], baseColor[1], baseColor[2], 0.6]
          : asArray(baseColor).slice(0, 3).concat(0.6);

      if (geom.getType() === 'Polygon') {
        ellipseStyle.getFill().setColor(rgba);
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
  const vehicleFlowsSource = new VectorSource();

  dangerZones.forEach(dangerZone => {
    const start = fromLonLat([dangerZone.startLocation.lon, dangerZone.startLocation.lat]);
    const end = fromLonLat([dangerZone.endLocation.lon, dangerZone.endLocation.lat]);

    const lineFeature = new Feature({
      geometry: new LineString([start, end]),
      type: 'flow'
    });
    lineFeature.set('dangerColor', dangerZone.color);
    vehicleFlowsSource.addFeature(lineFeature);

    const startPoint = new Feature({
      geometry: new Point(start),
      type: 'start'
    });
    startPoint.set('dangerColor', dangerZone.color);
    vehicleFlowsSource.addFeature(startPoint);

    const endPoint = new Feature({
      geometry: new Point(end),
      type: 'end'
    });
    endPoint.set('dangerColor', dangerZone.color);
    vehicleFlowsSource.addFeature(endPoint);
  });

  const lineStyle = new Style({
    stroke: new Stroke({
      color: 'black',
      width: 3
    })
  });

  const pointStyle = new Style({
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: 'black' })
    })
  });

  return new VectorLayer({
    source: vehicleFlowsSource,
    visible: false,
    style: feature => {
      const geomType = feature.getGeometry().getType();
      const color = feature.get('dangerColor') || 'black';

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

function createVehicleQueueLayer() {
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

function createLayers(singleDangerZones, vehicleFlowDangerZones) {
  const singleLayer = createSingleLayer(singleDangerZones);
  const vehicleFlowLayer = createVehicleFlowLayer(vehicleFlowDangerZones);
  const vehicleQueueLayer = createVehicleQueueLayer();

  olLayers.singles = singleLayer;
  olLayers.vehicleFlows = vehicleFlowLayer;
  olLayers.vehicleQueues = vehicleQueueLayer;

  return { singleLayer, vehicleFlowLayer, vehicleQueueLayer };
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

  const {
    singleLayer,
    vehicleFlowLayer,
    vehicleQueueLayer
  } = createLayers(singleDangerZones, vehicleFlowDangerZones);

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

    map.value.forEachFeatureAtPixel(pixel, (feature, layer) => {
      if (feature.getGeometry().getType() === 'Polygon') {
        const dangerData = feature.get('dangerData');
        if (dangerData) {
          found = dangerData;
        }
      }
    });

    if (showSimulationPanel.value && found == null) {
      await closeSimulationPanel();
    }
    else if (found != null) {
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