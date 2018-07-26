'use strict';
const Promise = require("bluebird");
const millisec2str = require('./millisec2str');
const logger  = require('./logger');

function RateLimiter(redis) {
    var redis = redis;

    this.check = (clientIp, url) => {
        let ipHash = ":ip:" + clientIp;
        let ipWildcardHash = ":ip:*";
        let pathHash = ":path:" + url;
        let ipPathHash = ":ip-path:" + clientIp + ":" + url;

        var epochMilli =  Date.now();

        let hashes = [
            ipHash,
            ipWildcardHash,
            pathHash,
            ipPathHash
        ];

        return Promise.each(hashes, hash => {
            //se podria usar reglas locales en memoria para no ir a redis a buscarlas cada vez q llega un request
            return redis.get("rules" + hash).then(rule => {
                if(rule){
                    rule = JSON.parse(rule);
    
                    return redis.processCounter("state" + hash, epochMilli, rule.timeWindow, rule.maxHits).then(result => {
                        result = JSON.parse(result);
                        //logger.log('info', "result for rule %s", hash, result.allowed);
                        
                        if(result.allowed == 0)
                            throw new RateLimitReachedError(this.getLimitMsg(rule, result), rule, result);
                    });
                } else
                    return Promise.resolve();
            });
        })
    };

    this.getLimitMsg = (rule, validationResult) => {
        return `You have reach ${rule.maxHits} hits in the last ${millisec2str(rule.timeWindow)} limit. Please retry in ${millisec2str(validationResult.millisec_retry)}.`;
    };


}

class RateLimitReachedError extends Error {
    constructor (message, rule, validationResult) {
      super(message);
      this.name = this.constructor.name;
      Error.captureStackTrace(this, this.constructor);
      this.rule = rule;
      this.validationResult = validationResult;          
    }
};

  
module.exports = {
    RateLimiter,
    RateLimitReachedError
};