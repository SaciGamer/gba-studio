const webpack = require('webpack');
const { override, addWebpackPlugin, addLessLoader } = require('customize-cra');

module.exports = override(
  (config) => {
    const fallback = config.resolve.fallback || {};
    Object.assign(fallback, {
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "assert": require.resolve("assert"),
      "http": require.resolve("stream-http"),
      "https": require.resolve("https-browserify"),
      "os": require.resolve("os-browserify"),
      "url": require.resolve("url"),
      "fs": false,
      "path": require.resolve("path-browserify"),
      "process": require.resolve("process/browser")
    });
    config.resolve.fallback = fallback;
    
    config.plugins = (config.plugins || []).concat([
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer']
      })
    ]);

    return config;
  },
  addWebpackPlugin(
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    })
  ),
  addLessLoader({
    lessOptions: {
      modifyVars: { '@primary-color': '#ffa500' }, // Laranja
      javascriptEnabled: true,
    },
  }),
);