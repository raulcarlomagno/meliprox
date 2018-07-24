const http = require('http');
const httpProxy = require('http-proxy');
const winston = require('winston');
const Promise = require("bluebird");


var Redis = require('ioredis');
var redis = new Redis(6379, '172.17.0.2');
var fs = require("fs");

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

function secondsToStr(seconds) {

    function numberEnding (number) {
        return (number > 1) ? 's' : '';
    }

    var years = Math.floor(seconds / 31536000);
    if (years) {
        return years + ' year' + numberEnding(years);
    }
    //TODO: Months! Maybe weeks? 
    var days = Math.floor((seconds %= 31536000) / 86400);
    if (days) {
        return days + ' day' + numberEnding(days);
    }
    var hours = Math.floor((seconds %= 86400) / 3600);
    if (hours) {
        return hours + ' hour' + numberEnding(hours);
    }
    var minutes = Math.floor((seconds %= 3600) / 60);
    if (minutes) {
        return minutes + ' minute' + numberEnding(minutes);
    }
    var seconds = seconds % 60;
    if (seconds) {
        return seconds + ' second' + numberEnding(seconds);
    }
    return 'less than a second';
}

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


redis.monitor(function (err, monitor) {
    monitor.on('monitor', function (time, args, source, database) {
        console.log(args);
    });
});

var server = http.createServer(async (req, res) => {
    const clientIp = (req.connection.remoteAddress == '::1' ? '127.0.0.1' : req.connection.remoteAddress).replace(/:/g, '·'); //sino redis toma los : como separador del key
    const luaIpKey = 'state:ip:' + clientIp;
    const luaPathKey = 'state:path:' + req.url;
    const luaIpPathKey = 'state:ip-path:' + clientIp + '-' + req.url;

    var epochSeconds =  Date.now()/1000|00;

    console.log("requesting %s from ip %s", req.url, clientIp);

    var rulesPromises = [
        () => redis.get("rules:ip:" + clientIp),
        () => redis.get("rules:ip:*"),
        () => redis.get("rules:path:" + req.url),
        () => redis.get("rules:ip-path:" + clientIp + ":" + req.url)
    ];   

    Promise.each(rulesPromises, (rulePromise, index, length) => {
        rulePromise().then(rule => {
            if(rule){
                rule = JSON.parse(rule);

                redis.processCounter(luaIpKey, epochSeconds, rule.timeWindow, rule.maxHits).then(result => {
                    var rateLimitReached = result[0] == 1;
            
                    //console.log(result);
                   
            
                    if(rateLimitReached) { //denied
                        res.writeHead(429, { 'Content-Type': 'text/plain' });
                        let limitMsg = `you have reach your limit of ${rule.maxHits} hits in the last ${rule.timeWindow} seconds`;
                        console.warn(limitMsg);
                        if(result[3] != 0) {//oldest item
                            //console.error("please retry in %s seconds", new Date((result[3] + expiresInSeconds)*1000));
                            let v1 = new Date(epochSeconds*1000);
                            let v2 = new Date((result[3]+ rule.timeWindow)*1000);
                            console.error("please retry in %s", secondsToStr((v2 - v1)/1000));
                        }
                        res.end(limitMsg);
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('request successfully proxied to: ' + req.url);
                    }
            
                });   
            }
                return Promise.resolve();
        });
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


(() =>  {
   
    redis.set("rules:ip:127.0.0.1", JSON.stringify({maxHits: 1, timeWindow: 2})); //se podria haber usado un hset para optimizar un poco mas, pero se harian mas lecturas a redis para recuperar y setear
    redis.set("rules:ip:*", JSON.stringify({maxHits: 2, timeWindow: 10})); 
    redis.set("rules:path:/sites/MLA/categories", JSON.stringify({maxHits: 1, timeWindow: 10}));
    redis.set("rules:ip-path:*-/sites/MLB/categories", JSON.stringify({maxHits: 2, timeWindow: 4}));


    server.listen(PORT, () => console.log("listening on port %s", PORT));
})() 
