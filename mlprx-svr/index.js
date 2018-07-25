const http = require('http');
const httpProxy = require('http-proxy');
const winston = require('winston');
const Promise = require("bluebird");
const RateLimiter = require('./rateLimiter');
const millisec2str = require('./millisec2str');

const Redis = require('ioredis');
var redis = new Redis(6379, '172.17.0.2');
var fs = require("fs");

var rateLimiter = new RateLimiter(redis);

const PORT = process.env.PORT || 8888;

var proxy = httpProxy.createProxyServer({});

//TokenBucket
//RateLimiter
//se podria usar reglas locales en memoria para no ir a redis a buscarlas cada vez q llega un request

var processCounterScript = fs.readFileSync('process_counter.lua').toString(); //deberimos cargarlo con loadscript desde el manager y aca ejecutar un evalsha con el hash qeu vendria por config

redis.defineCommand('processCounter', {
    numberOfKeys: 1,
    lua: processCounterScript
});

/*
fs.watch('process_counter.lua', () => {
    console.log('process_counter.lua reloaded');
    redis.defineCommand('processCounter', {
        numberOfKeys: 1,
        lua: fs.readFileSync('process_counter.lua').toString()
    });
});
*/

/*
proxy.on('proxyReq', (proxyReq, req, res, options) => {
    proxyReq.setHeader('X-ReqId', 'foobar');
    //console.log(req.headers);
    //console.log(res);
});
*/

proxy.on('proxyRes', (proxyRes, req, res) => {
    //console.log('RAW Request', req);
    //console.log('RAW Request', JSON.stringify(req.headers, true, 2));
    //console.log('RAW Response (%s) from the target', proxyRes.statusCode, JSON.stringify(proxyRes.headers, true, 2));
    res.setHeader('X-Proxied-By', 'MeliProx');
    //agregar etiquetas de cacheo para el browser?!?!?
});


proxy.on('error', (err, req, res) => {
    console.error(err.reason);
    res.writeHead(500, {
      'Content-Type': 'text/plain',
      'X-Proxied-By': 'MeliProx'
    });
    res.end('Something went wrong. And we are reporting a custom error message.');    
});

/*
redis.monitor(function (err, monitor) {
    monitor.on('monitor', function (time, args, source, database) {
        console.log(args);
    });
});
*/

var server = http.createServer(async (req, res) => {
    const clientIp = req.connection.remoteAddress.replace(/:/g, '·'); //sino redis toma los : como separador del key
    console.log("requesting %s from ip %s", req.url, clientIp);

    rateLimiter.check(clientIp, req.url)
    .catch(err => {
        //console.error(err);

        res.writeHead(429, { 'Content-Type': 'text/plain' });
        let limitMsg = `you have reach ${err.rule.maxHits} hits in the last ${err.rule.timeWindow/1000} seconds limit`;
        console.warn(limitMsg);
        if(err.millisecondsToRetry >= 0)
            console.warn("please retry in %s", millisec2str(err.millisecondsToRetry));

        res.write(limitMsg);
        res.end();
    })
    .then(() => {
        //console.log('request successfully proxied to: ' + req.url);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('request successfully proxied to: ' + req.url);
    });    
 
    //chequear las reglas
    //whitelist blacklist
    //buscar la pagina en cache primero si es un GET, antes pde proxiar


});


(() =>  {
   
    
    redis.set("rules:ip:··1", JSON.stringify({maxHits: 1, timeWindow: 5 * 1000})); //se podria haber usado un hash para optimizar un poco mas
    redis.set("rules:ip:*", JSON.stringify({maxHits: 3, timeWindow: 5 * 1000}));
    /*
    redis.set("rules:path:/sites/MLA/categories", JSON.stringify({maxHits: 1, timeWindow: 10}));
    redis.set("rules:ip-path:*-/sites/MLB/categories", JSON.stringify({maxHits: 2, timeWindow: 4}));
    */
    
    server.listen(PORT, () => console.log("listening on port %s", PORT));
})() 
