<template>
  <div id="weather-info" class="weather-panel">
    <div class="weather-row">
      <span>{{ temperature }}°C</span>
      <img :src="iconUrl" style="width: 48px; height: 48px;">
    </div>
    <div class="weather-row">
      <span>{{ windSpeed }} м/с</span>
      <img
          :src="arrowIcon"
          style="width: 24px; height: 24px;"
          :style="{ transform: `rotate(${windDirection}deg)` }"
      >
    </div>
  </div>
</template>

<script>
import arrowIcon from "../icons/arrow.png";

export default {
  name: "WeatherInfo",
  props: {
    temperature: { type: Number, required: true },
    iconUrl: { type: String, required: true },
    windSpeed: { type: Number, required: true },
    windDirection: { type: Number, required: true },
  },
  data() {
    return {
      arrowIcon,
    };
  },
};
</script>

<style>
#weather-info {
  position: absolute;
  top: 24px;
  right: 24px;
  background-color: #ffffff;
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  width: 120px;
  font-family: Arial, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 999;
  text-align: left;
}

.weather-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
</style>
