module.exports = function getBabelConfiguration(api) {
  api.cache(true);
  return {
    comments: false,
    presets: [
      '@babel/preset-flow',
      [
        '@babel/preset-env',
        {
          shippedProposals: true,
          useBuiltIns: 'usage',
          targets: {
            node: '9',
            browsers: ['last 2 versions'],
          },
        },
      ],
      ...(process.env.NODE_ENV === 'production' ? ['babel-preset-minify'] : []),
    ].filter(Boolean),
    plugins: [
      '@babel/plugin-proposal-class-properties',
      '@babel/plugin-proposal-optional-chaining',
      ...(process.env.NODE_ENV === 'test' ? ['istanbul', 'dynamic-import-node'] : []),
    ].filter(Boolean),
  };
};
