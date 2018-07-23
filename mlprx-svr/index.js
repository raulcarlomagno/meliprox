const http = require('http');
const httpProxy = require('http-proxy');
const winston = require('winston');
var Redis = require('ioredis');
var redis = new Redis(6379, '172.17.0.2');
var fs = require("fs");

const PORT = process.env.PORT || 8888;

var proxy = httpProxy.createProxyServer({});


var processCounterScript = fs.readFileSync('process_counter.lua').toString(); //deberimos cargarlo con loadscript desde el manager y aca ejecutar un evalsha con el hash qeu vendria por config

redis.defineCommand('processCounter', {
    numberOfKeys: 1,
    lua: processCounterScript
});

/*
fs.watch('clean.lua', () => {
    console.log('clean.lua reloaded');
    luaClean = fs.readFileSync('clean.lua').toString();
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

var server = http.createServer((req, res) => {
    const clientIp = (req.connection.remoteAddress == '::1' ? '127.0.0.1' : req.connection.remoteAddress).replace(/:/g, '·'); //sino redis toma los : como separador del key
    const luaIpKey = 'ip:' + clientIp;

    var epochSeconds =  Date.now()/1000|00;
    var expiresInSeconds = 5;
    const MAX_QTY_IN_WINDOW = 2;

    console.log("requesting %s from ip %s", req.url, clientIp);

    //redis.eval(processCounterScript, 1, luaIpKey, epochSeconds, expiresInSeconds, MAX_QTY_IN_WINDOW).then(result => {
    redis.processCounter(luaIpKey, epochSeconds, expiresInSeconds, MAX_QTY_IN_WINDOW).then(result => {
        //console.log(result);

        res.writeHead(200, { 'Content-Type': 'text/plain' });

        if(result[0] == 1) { //denied
            let limitMsg = `you have reach your limit of ${MAX_QTY_IN_WINDOW} hits in the last ${expiresInSeconds} seconds`;
            console.warn(limitMsg);
            if(result[3] != 0) {//oldest item
                //console.error("please retry in %s seconds", new Date((result[3] + expiresInSeconds)*1000));
                let v1 = new Date(epochSeconds*1000);
                let v2 = new Date((result[3]+ expiresInSeconds)*1000);
                console.error("please retry in %s seconds", (v2 - v1)/1000);
            }
            res.end(limitMsg);
        } else {
            res.end('request successfully proxied to: ' + req.url);
        }

    });

    
 
    //chequear las reglas
    //whitelist blacklist
    //buscar la pagina en cache primero si es un GET, antes pde proxiar


    //if(((new Date().getTime()) % 2) == 0)

    /*else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('request successfully proxied to: ' + req.url + '\n' + JSON.stringify(req.headers, true, 2));
        res.end();
    }*/

});

server.listen(PORT, () => console.log("listening on port %s", PORT));