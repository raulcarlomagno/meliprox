const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json()
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.splat(),
        winston.format.simple()
      ),
      colorize: true,
      timestamp: true
    }));
}

module.exports = logger;