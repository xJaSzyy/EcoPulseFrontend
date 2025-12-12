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
  </div>
</template>

<script setup>
import { onMounted, ref, reactive } from 'vue'
import 'ol/ol.css'
import Map from 'ol/Map'
import { fromLonLat } from 'ol/proj'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'

import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Point, Polygon } from 'ol/geom'
import Feature from 'ol/Feature'
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style'

import { calculateMaximumSingleDangerZone } from '../api/emission.js';
import { getCurrentWeather } from '../api/weather.js';

const mapRoot = ref(null)
const map = ref(null)

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

function createEllipse() {
  const dangerZone = {
    lon: 86.0833,
    lat: 55.3333,
    length: 1000,
    width: 500,
    angle: 0, // windDirection
    color: 'rgba(164, 125, 184, 0.6)'
  }

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

  return ellipseFeature;
}

function createLayers() {
  const singlesSource = new VectorSource()
  const ellipse1 = createEllipse();
  singlesSource.addFeature(ellipse1);

  const singlesLayer = new VectorLayer({
    source: singlesSource,
    visible: true
  });


  const vehicleFlowsSource = new VectorSource()
  const vehicleFlowsFeature = new Feature({
    geometry: new Point(fromLonLat([86.028311, 55.349136]))
  })
  vehicleFlowsSource.addFeature(vehicleFlowsFeature)

  const vehicleFlowsLayers = new VectorLayer({
    source: vehicleFlowsSource,
    visible: false,
    style: new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: 'green' })
      })
    })
  })

  const vehicleQueuesSource = new VectorSource()
  const vehicleQueuesFeature = new Feature({
    geometry: new Point(fromLonLat([86.114142, 55.352852]))
  })
  vehicleQueuesSource.addFeature(vehicleQueuesFeature)

  const vehicleQueuesLayers = new VectorLayer({
    source: vehicleQueuesSource,
    visible: false,
    style: new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: 'blue' })
      })
    })
  })

  olLayers.singles = singlesLayer;
  olLayers.vehicleFlows = vehicleFlowsLayers;
  olLayers.vehicleQueues = vehicleQueuesLayers;

  return { singlesLayer, vehicleFlowsLayers, vehicleQueuesLayers };
}

onMounted(() => {
  const baseLayer = new TileLayer({
    source: new OSM()
  })

  const {
    singlesLayer,
    vehicleFlowsLayers,
    vehicleQueuesLayers
  } = createLayers()

  map.value = new Map({
    target: mapRoot.value,
    layers: [baseLayer, singlesLayer, vehicleFlowsLayers, vehicleQueuesLayers ],
    view: new View({
      center: fromLonLat([86.0833, 55.3333]),
      zoom: 12
    })
  })
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
  top: 10px;
  left: 10px;
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
</style>