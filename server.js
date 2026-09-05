const { readConfig } = require('./server/config.js');
const { createApp } = require('./server/app.js');

const config = readConfig();
const app = createApp(config);
app.listen(config.port, '127.0.0.1', () => {
  console.log(`Wanderer.OS listening on 127.0.0.1:${config.port}`);
});
