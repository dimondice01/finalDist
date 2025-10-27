// dimondice01/finaldistribuidora/finalDistribuidora-1961e06bd70e88b0de70775136eef2f81a0b248d/babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Plugin de NativeWind
      // FIX: Requerido para que Reanimated funcione sin NA.
    ],
  };
};