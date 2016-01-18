var bunyan = require('bunyan');
var KinesisStream = require('aws-kinesis-writable');
var fs = require('fs');
var mkdirp = require('mkdirp');
var moment = require('moment');
var path = require('path');
var util = require('util');
var _ = require('underscore');

var config = require(path.resolve(__dirname + '/../../config'));
var options = config.get('logging');
var awsConfig = config.get('aws');
var enabled = options.enabled;
var logPath = path.resolve(options.path + '/' + options.filename + '.' + config.get('env') + '.' + options.extension);
var accessLogPath = path.resolve(options.path + '/' + options.filename + '.access.' + options.extension);

// create log directory if it doesn't exist
mkdirp(path.resolve(options.path), {}, function(err, made) {
    if (err) {
        module.exports.error(err);
    }

    if (made) {
        module.exports.info('Log directory created at ' + made);
    }
});

var log = bunyan.createLogger({
    name: 'dadi-web',
    serializers: bunyan.stdSerializers,
    streams: [
      //{ level: 'debug', stream: process.stdout },
      { level: 'info', path: logPath },
      { level: 'error', path: logPath }
    ]
});

var accessLog;
if (options.accessLog.enabled) {
  accessLog = bunyan.createLogger({
      name: 'access',
      serializers: bunyan.stdSerializers,
      streams: [
        {
          type: 'rotating-file',
          path: accessLogPath,
          period: options.accessLog.fileRotationPeriod,
          count: options.accessLog.fileRetentionCount
        }
      ]
  });
}

if (options.accessLog.enabled && options.accessLog.kinesisStream !== '') {
  // Create a log stream
  accessLog.addStream(
    {
      name: 'Kinesis Log Stream',
      level: 'info',
      stream: new KinesisStream ({
        accessKeyId: awsConfig.accessKeyId,
        secretAccessKey: awsConfig.secretAccessKey,
        region:          awsConfig.region,
        streamName:      options.accessLog.kinesisStream,
        partitionKey:    'dadi-web'
      })
    }
  );
  var logStream = _.findWhere(accessLog.streams, { 'name' : 'Kinesis Log Stream' });
  logStream.stream.on('error', function (err) {
    console.log(err);
    log.warn(err);
  });
}

var self = module.exports = {

    access: function access() {
        if (enabled && options.accessLog.enabled) {
          try {
            accessLog.info.apply(accessLog, arguments);
          }
          catch (err) {
            log.error(err);
          }
        }
    },

    debug: function debug() {
        if (enabled) log.debug.apply(log, arguments);
    },

    info: function info() {
        if (enabled) log.info.apply(log, arguments);
    },

    warn: function warn() {
        if (enabled) log.warn.apply(log, arguments);
    },

    error: function error() {
        if (enabled) log.error.apply(log, arguments);
    },

    trace: function trace() {
        if (enabled) log.trace.apply(log, arguments);
    },

    get: function get() {
        return log;
    },

    getAccessLog: function getAccessLog() {
        return accessLog;
    },

    requestLogger: function (req, res, next) {
        var start = Date.now();
        var _end = res.end;
        res.end = function () {
            var duration = Date.now() - start;

            var clientIpAddress = req.connection.remoteAddress;
            if (req.headers.hasOwnProperty('x-forwarded-for')) {
              clientIpAddress = getClientIpAddress(req.headers['x-forwarded-for']);
            }

            var accessRecord = (clientIpAddress || '') +
            ' -' +
            ' ' + moment().format() +
            ' ' + req.method + ' ' + req.url + ' ' + 'HTTP/' + req.httpVersion +
            ' ' + res.statusCode +
            ' ' + (res._headers ? res._headers['content-length'] : '') +
            (req.headers["referer"] ? (' ' + req.headers["referer"]) : '') +
            ' ' + req.headers["user-agent"];

            // write to the access log first
            self.access(accessRecord);

            // log the request method and url, and the duration
            log.info({module: 'router'}, req.method +
                ' ' + req.url +
                ' ' + res.statusCode +
                ' ' + duration + 'ms');

            _end.apply(res, arguments);
        };
        next();
    }
};

var getClientIpAddress = function (input) {

  // matches all of the addresses in the private ranges and 127.0.0.1 as a bonus
  var privateIpAddress = /(^127.0.0.1)|(^10.)|(^172.1[6-9].)|(^172.2[0-9].)|(^172.3[0-1].)|(^192.168.)/;
  var validIpAddress = /(\d{1,3}.\d{1,3}.\d{1,3}.\d{1,3})/;

  var ips = input.split(',');
  var result = '';

  _.each(ips, function (ip) {
    if (ip.match(validIpAddress)) {
      if (!ip.match(privateIpAddress)) {
        result = ip;
      }
    }
  });

  return result.trim();
};


/**
 * DEPRECATED Log message if running at stage level
 *
 * @param {String} message
 * @return undefined
 * @api public
 */
module.exports.stage = function() {
  util.deprecate(function (message, done) {
    //module.exports.info(message);
}, module.exports.warn('log.stage() is deprecated and will be removed in a future release. Use log.debug(), log.info(), log.warn(), log.error(), log.trace() instead.'));
};

/**
 * DEPRECATED Log message if running at production level
 *
 * @param {String} message
 * @return undefined
 * @api public
 */
module.exports.prod = function() {
  util.deprecate(function (message, done) {
    //module.exports.info(message);
}, module.exports.warn('log.prod() is deprecated and will be removed in a future release. Use log.debug(), log.info(), log.warn(), log.error(), log.trace() instead.'));
};
