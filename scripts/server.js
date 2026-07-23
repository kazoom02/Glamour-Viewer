const http = require('http');
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    console.log("RECEIVED BONES:", body);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end('ok');
  });
});
server.listen(4000, '0.0.0.0', () => console.log('Listening on 4000'));
