const http = require('http');
const httpProxy = require('http-proxy');
const logger  = require('./logger');
const { RateLimiter, RateLimitReachedError }  = require('./rateLimiter');
const util = require('./Util');

const Redis = require('ioredis');
var redis = new Redis(6379, '172.17.0.2'); //sacar de entorno o config, ver
var fs = require("fs");

//pasar a un config
const DEFAULT_PAGE_TTL = 5; //in seconds //hacer ttl por pagina
const PRODUCT_NAME = "MeliProx";

var rateLimiter = new RateLimiter(redis);

var proxy = httpProxy.createProxyServer({});

redis.defineCommand('processCounter', {
    numberOfKeys: 1,
    lua: fs.readFileSync('process_counter.lua').toString() //deberimos cargarlo con loadscript desde el manager y aca ejecutar un evalsha con el hash qeu vendria por config
});

proxy.on('proxyRes', (proxyRes, req, res) => {
    res.setHeader('X-Proxied-By', PRODUCT_NAME);
    res.setHeader('X-Cache-' + PRODUCT_NAME, 'MISS');

    var body = new Buffer('');
    proxyRes.on('data', function (data) {
        body = Buffer.concat([body, data]);
    });

    proxyRes.on('end', function () {
        body = body.toString();
        
        let pageKey = 'pages:' + req.url;
        
        redis.multi().hmset(pageKey, 'body', body, 'headers', JSON.stringify(proxyRes.rawHeaders))
        .expire(pageKey, DEFAULT_PAGE_TTL)
        .exec()
        .then(logger.log('info', 'page %s cached', req.url));
    });    
});

proxy.on('error', (err, req, res) => {
    logger.error(err.reason);
    res.writeHead(500, {
      'Content-Type': 'text/plain',
      'X-Proxied-By': PRODUCT_NAME
    });
    res.end('Something went wrong.');    
});

var server = http.createServer((req, res) => {
    const clientIp = req.connection.remoteAddress.replace(/:/g, '·'); //sino redis toma los : como separador del key
    logger.log('info', 'requesting %s from ip %s', req.url, clientIp);

    //hacer whitelist blacklist

    rateLimiter.check(clientIp, req.url)
    .then(() => {
        redis.hgetall("pages:" + req.url).then(pageResult => {
            if(pageResult && pageResult.body){
                logger.log('info', 'HIT. page %s for ip %s', req.url, clientIp);

                let headers = util.rawHeadersToHash(JSON.parse(pageResult.headers))
                headers['X-Proxied-By'] = PRODUCT_NAME;
                headers['X-Cache-' + PRODUCT_NAME] = 'HIT';
                res.writeHead(200, headers);
                res.end(pageResult.body);
            } else {
                logger.log('info', 'MISS. request proxied to %s for ip %s', req.url, clientIp);
                proxy.web(req, res, {
                    target: 'https://api.mercadolibre.com', //sacar de config
                    changeOrigin: true,
                    xfwd: true,
                    followRedirects: true
                });
            }

        })


    })    
    .catch(error => {
        logger.error(error.message);
        if (error instanceof RateLimitReachedError) {
            res.writeHead(429, { 'Content-Type': 'text/plain' });
            res.end(error.message);
        } else
            throw error;
    });
});


(() =>  {
    redis.set("rules:ip:··1", JSON.stringify({maxHits: 2, timeWindow: 4 * 1000})); //se podria haber usado un hash para optimizar un poco mas
    redis.set("rules:ip:*", JSON.stringify({maxHits: 3, timeWindow: 5 * 1000}));
    /*
    redis.set("rules:path:/sites/MLA/categories", JSON.stringify({maxHits: 1, timeWindow: 10}));
    redis.set("rules:ip-path:*-/sites/MLB/categories", JSON.stringify({maxHits: 2, timeWindow: 4}));
    */
    
    let PORT = process.env.PORT || 8888;

    server.listen(PORT, () => logger.log('info', '%s listening on port %s', PRODUCT_NAME, PORT));
})() 
