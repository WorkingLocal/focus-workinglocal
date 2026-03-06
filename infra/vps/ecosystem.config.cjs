// PM2 process config for VPS deployment
// Usage: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name:   'focus-kiosk',
      script: './kiosk-server/server.js',
      cwd:    '/opt/focus-workinglocal',
      env: {
        NODE_ENV:         'production',
        PORT:             3000,
        PUBLIC_URL:       'https://focus.workinglocal.be',
        OPERATOR_SECRET:  'change-me-to-a-strong-random-secret',
      },
    },
  ],
};
