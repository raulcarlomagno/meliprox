'use strict';
const Promise = require("bluebird");

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
            return redis.get("rules" + hash).then(rule => {
                if(rule){
                    rule = JSON.parse(rule);
    
                    return redis.processCounter("state" + hash, epochMilli, rule.timeWindow, rule.maxHits).then(result => {
                        result = JSON.parse(result);
                        //console.log("result for rule %s", hash, result.allowed);
    
                        var rateLimitReached = (result.allowed == 0);
                        
                        if(rateLimitReached)  //denied
                            throw {
                                rule: rule,
                                validationResult: result,
                                epoch: epochMilli,
                                millisecondsToRetry: (result.oldest_item > 0 ? (result.oldest_item + rule.timeWindow - epochMilli) : -1)
                            };
                    });
                } else
                    return Promise.resolve();
            });
        })
    };
}
  

  
module.exports = RateLimiter;
