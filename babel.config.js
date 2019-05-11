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
            node: '10',
          },
        },
      ],
    ].filter(Boolean),
    plugins: [
      '@babel/plugin-proposal-class-properties',
      '@babel/plugin-proposal-optional-chaining',
      ...(process.env.NODE_ENV === 'test' ? ['istanbul', 'dynamic-import-node'] : []),
    ].filter(Boolean),
  };
};
