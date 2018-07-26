local key = KEYS[1]
local epoch = tonumber(ARGV[1])
local expires_in_ms = tonumber(ARGV[2]) --milliseconds to expire
local valid_start_epoch = epoch - expires_in_ms --ahora menos la ventana de tiempo, todo lo que sea menor a ese momento, expiró
local max_qty_in_window = tonumber(ARGV[3])
local items_expired = 0 
local current_qty_in_set = 0
local allowed = 1 -- el request fue denegado?
local oldestAliveItem = 0
local returnObj = {}

for index, value in next, redis.call('SMEMBERS', key) do
    if tonumber(value) < valid_start_epoch then
        redis.call('SREM', key, value);
        items_expired = items_expired + 1
    else
        oldestAliveItem = tonumber(value)
        break
    end
end

current_qty_in_set = redis.call('SCARD', key)

if (current_qty_in_set + 1 > max_qty_in_window) then
    allowed = 0
else
    redis.call('SADD', key, epoch)
    redis.call('PEXPIREAT', key, epoch + expires_in_ms) --expiracion en ms
end

returnObj['allowed'] = allowed
returnObj['current_qty_in_set'] = current_qty_in_set
returnObj['items_expired'] = items_expired
returnObj['oldest_item'] = oldestAliveItem
returnObj['millisec_retry'] = oldestAliveItem + expires_in_ms - epoch

--se pudo haber optimizado mandando los valores por separados y no encodeando json

return cjson.encode(returnObj)