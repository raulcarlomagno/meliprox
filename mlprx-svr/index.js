const http = require('http');
const httpProxy = require('http-proxy');
const winston = require('winston');
var Redis = require('ioredis');
var redis = new Redis(6379, '172.17.0.2');


const PORT = process.env.PORT || 8888;

var proxy = httpProxy.createProxyServer({});


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
   
    console.log("requesting %s from ip %s", req.url, clientIp);

    var epochSeconds =  Date.now()/1000|00;
    var expiresInSeconds = 5;
    const MAX_QTY_IN_WINDOW = 2;

    redis.pipeline()
    .sadd(clientIp, epochSeconds)
    .expireat(clientIp, epochSeconds + expiresInSeconds)
    .smembers(clientIp)
    .exec()
    .then(result => {

        let hitsTs = result[2][1];
        var keysToDelete = hitsTs.filter(tsHit => parseInt(tsHit) < (epochSeconds - expiresInSeconds));
        var currentHitsCount = 0;
    
        let removePromise = Promise.resolve();

        if(keysToDelete.length > 0) { //chequear de otra forma
            console.log("%s items to delete for key %s", keysToDelete.length, clientIp);
            removePromise = redis.srem(clientIp, keysToDelete);
        }
        
        qtyInWindow = hitsTs.length - keysToDelete.length;
        
        /* solo para chequear inconsistencia
        removePromise.then(() => {
            redis.scard(clientIp).then(cant => {
                console.log("cantredis %s | cantactual %s", cant, qtyInWindow);
            });
        })
        */


        res.writeHead(200, { 'Content-Type': 'text/plain' });
        if(qtyInWindow > MAX_QTY_IN_WINDOW) {
            let limitMsg = `you have reach ${MAX_QTY_IN_WINDOW} hits in the last ${expiresInSeconds} seconds`;
            console.error(limitMsg);
            //console.error("please retry in %s seconds", );
            res.end(limitMsg);
        } else {
            res.end('request successfully proxied to: ' + req.url);
        }

        
    });
    
    /*
    redis.sadd(clientIp, epochSeconds).then(() => {
        //console.log("expires at %s", epochSeconds + expiresInSeconds);
        redis.expireat(clientIp, epochSeconds + expiresInSeconds).then(() => {
            redis.smembers(clientIp).then(result => {
                //var multiDel = redis.multi();

                var keysToDelete = result.filter(v => parseInt(v) < (epochSeconds - expiresInSeconds));
    
                if(keysToDelete.length > 0) { //chequear de otra forma
                    console.log("%s items to delete for key %s", keysToDelete.length, clientIp);
                    redis.srem(clientIp, keysToDelete).then(() => {
                        redis.scard(clientIp).then(console.log);
                    })
                } else {
                    console.log("no items to delete for key %s", clientIp);
                    redis.scard(clientIp).then(console.log);
                }
            });
        })
    });
*/

    //redis.incr(req.connection.remoteAddress);
    
    /*
    limiter.incr(clientIp, function() {
        if (err) 
            return console.error("Error: " + err);
        console.log("Is rate limited? " + isRateLimited);
    });
    */

    





    /*
    redis.llen(clientIp).then(result => {
        console.log("cant llamadas %s", result);

        if(result > 3){

        } else{
            var redisCall = null;

            redis.exists(clientIp).then(result => {
                console.log("key exists: %s", result == 1);

                if(result == 1)
                    redisCall = redis.multi().rpush(clientIp, clientIp).expire(clientIp, 10).exec();    
                else
                    redisCall = redis.rpush(clientIp, clientIp);    

                redisCall.then(result => {
                    proxy.web(req, res, {
                        target: 'https://api.mercadolibre.com',
                        changeOrigin: true,
                        xfwd: true,
                        followRedirects: true
                    });
                })
            })

        }
    });
    */
        


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