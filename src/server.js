const app = require('./app');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));
