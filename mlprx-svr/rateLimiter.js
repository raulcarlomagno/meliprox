'use strict';
const Promise = require("bluebird");
const logger  = require('./logger');
const util = require('./Util');

function RateLimiter(redis) {
    var redis = redis;

    this.check = (clientIp, url) => {
        const ipHash = ":ip:" + clientIp;
        const ipWildcardHash = ":ip:*";
        const pathHash = ":path:" + url;
        const ipPathHash = ":ip-path:" + clientIp + ":" + url;

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
        return `You have reach ${rule.maxHits} hits in the last ${util.millisecToStr(rule.timeWindow)} limit. Please retry in ${util.millisecToStr(validationResult.millisec_retry)}.`;
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