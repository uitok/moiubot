/**
 * Shared winston logger factory.
 *
 * Keep this small and dependency-light so every service (bot/agent/config-server)
 * can use a consistent logging setup.
 */

const fs = require('fs');
const path = require('path');
const winston = require('winston');

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err) {
    // If we cannot create the log dir, fall back to console-only logging.
  }
}

function createLogger(service, options = {}) {
  const level = options.level || process.env.LOG_LEVEL || 'info';
  const logDir = options.logDir || 'logs';
  const logFile = options.logFile || `${service}.log`;
  const silent = Boolean(options.silent);

  ensureDir(logDir);

  const baseFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true })
  );

  const transports = [
    new winston.transports.Console({
      silent,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf((info) => {
          const msg = typeof info.message === 'string' ? info.message : JSON.stringify(info.message);
          const rest = { ...info };
          delete rest.level;
          delete rest.message;
          delete rest.timestamp;
          delete rest.stack;

          const meta = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
          const stack = info.stack ? `\n${info.stack}` : '';

          return `${info.timestamp} [${service}] ${info.level}: ${msg}${meta}${stack}`;
        })
      )
    })
  ];

  // Best-effort file logging; if it fails at runtime, console output still works.
  try {
    transports.push(
      new winston.transports.File({
        silent,
        filename: path.join(logDir, logFile),
        format: winston.format.combine(baseFormat, winston.format.json())
      })
    );
  } catch (err) {
    // ignore
  }

  return winston.createLogger({
    level,
    format: baseFormat,
    defaultMeta: { service },
    transports
  });
}

module.exports = { createLogger };

