local key = KEYS[1] -- the key of the set to update
local epoch_seconds = tonumber(ARGV[1]) -- epoch in seconds
local expires_in_seconds = tonumber(ARGV[2]) -- expires in seconds
local limit_epoch = epoch_seconds - expires_in_seconds
local max_qty_in_window = tonumber(ARGV[3]) -- the current timestamp
local members_expired = 0 -- number of members expired/removed
local current_qty_in_set = 0
local denied = 0 -- final flag
local oldestAliveItem = 0

for index, value in next, redis.call('SMEMBERS', key) do
    if tonumber(value) < limit_epoch then
        redis.call('SREM', key, value);
        members_expired = members_expired + 1
    else
        oldestAliveItem = tonumber(value)
        break
    end
end

current_qty_in_set = redis.call('SCARD', key)

if(current_qty_in_set >= max_qty_in_window) then
    denied = 1
else
    redis.call('SADD', key, epoch_seconds)
    redis.call('EXPIREAT', key, epoch_seconds + expires_in_seconds)
    current_qty_in_set = current_qty_in_set + 1    
end


return {
    denied,
    current_qty_in_set,
    members_expired,
    oldestAliveItem
}