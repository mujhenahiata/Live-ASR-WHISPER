const path = require('path');

module.exports = function override(config, env) {
  config.resolve = {
    fallback: {
      path: require.resolve('path-browserify'),
      net: false, 
      tls: false, 
      fs: false,
      crypto: require.resolve('crypto-browserify'),
      buffer: require.resolve('buffer'),
      stream: require.resolve('stream-browserify'),
      timers: require.resolve('timers-browserify'),
      process: require.resolve('process/browser'),
      os: require.resolve('os-browserify/browser'),
      url: require.resolve('url/'),
      zlib: require.resolve('browserify-zlib'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      assert: require.resolve('assert/'),
      child_process: false, 
      dns: false, 
      // 'timers/promises': false 
    }
  };
  return config;
}