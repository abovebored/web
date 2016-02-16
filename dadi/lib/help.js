var fs = require('fs');
var path = require('path');
var http = require('http');
var url = require('url');
var util = require('util');
var _ = require('underscore');
var perfy = require('perfy');

var log = require(__dirname + '/log');
var token = require(__dirname + '/auth/token');
var config = require(__dirname + '/../../config.js');
var DatasourceCache = require(__dirname + '/cache/datasource');

var self = this;

module.exports.htmlEncode = function(input) {
    var encodedStr = input.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
        return '&#'+i.charCodeAt(0)+';';
    });
    return encodedStr;
}

module.exports.timer = {

  isDebugEnabled: function isDebugEnabled() {
    return config.get('debug');
  },

  start: function start(key) {
    if (!this.isDebugEnabled()) return;
    console.log('Start timer: ' + key);
    perfy.start(key, false);
  },

  stop: function stop(key) {
    if (!this.isDebugEnabled()) return;
    console.log('Stop timer: ' + key);
    if (perfy.exists(key)) perfy.end(key);
  },

  getStats: function getStats() {
    if (!this.isDebugEnabled()) return;
    var stats = [];
    _.each(perfy.names(), function (key) {
      if (perfy.result(key)) stats.push( { key:key, value: perfy.result(key).summary } );
    });
    perfy.destroyAll();
    return stats;
  }

}

module.exports.isApiAvailable = function(done) {

  if (config.get('api.enabled') === false) {
    return done(null, true);
  }

  var options = {
    hostname: config.get('api.host'),
    port: config.get('api.port'),
    path: '/',
    method: 'GET'
  };

  var request = http.request(options, function(res) {
    if (/200|401|404/.exec(res.statusCode)) {
      return done(null, true);
    }
  });

  request.on('error', function(e) {
    e.message = 'Error connecting to API: ' + e.message + '. Check the \'api\' settings in config file \'config/config.' + config.get('env') + '.json';
    e.remoteIp = options.hostname;
    e.remotePort = options.port;
    return done(e);
  });

  request.end();
}

// helper that sends json response
module.exports.sendBackJSON = function (successCode, res, next) {
    return function (err, results) {
        if (err) return next(err);

        var resBody = JSON.stringify(results, null, 4);

        res.setHeader('Server', config.get('server.name'));

        res.statusCode = successCode;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('content-length', Buffer.byteLength(resBody));
        res.end(resBody);
    }
}

module.exports.sendBackJSONP = function (callbackName, res, next) {
    return function (err, results) {

        // callback MUST be made up of letters only
        if (!callbackName.match(/^[a-zA-Z]+$/)) return res.send(400);

        res.statusCode = 200;

        var resBody = JSON.stringify(results);
        resBody = callbackName + '(' + resBody + ');';
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('content-length', resBody.length);
        res.end(resBody);
    }
}

// helper that sends html response
module.exports.sendBackHTML = function (method, successCode, contentType, res, next) {

  return function (err, results) {

    if (err) {
      console.log(err);
      return next(err);
    }

    var resBody = results;

    res.statusCode = successCode;
    res.setHeader('Server', config.get('server.name'));
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', Buffer.byteLength(resBody));
    //res.setHeader('Cache-Control', 'private, max-age=600');

    self.addHeaders(res);

    if (method.toLowerCase() === 'head') {
      res.setHeader('Connection', 'close');
      return res.end("");
    }
    else {
      return res.end(resBody);
    }
  }
}

/**
 * Adds hewders defined in the configuration file to the response
 * @param {res} res - the HTTP response
 */
module.exports.addHeaders = function(res) {
  var headers = config.get('headers');

  _.each(headers.cors, function(value, header) {
    res.setHeader(header, value);
    if (header === 'Access-Control-Allow-Origin' && value !== '*') {
      res.setHeader('Vary', 'Origin');
    }
  });
}

// function to wrap try - catch for JSON.parse to mitigate pref losses
module.exports.parseQuery = function (queryStr) {
    var ret;
    try {
        // strip leading zeroes from querystring before attempting to parse
        ret = JSON.parse(queryStr.replace(/\b0(\d+)/, "\$1"));
    }
    catch (e) {
        ret = {};
    }

    // handle case where queryStr is "null" or some other malicious string
    if (typeof ret !== 'object' || ret === null) ret = {};
    return ret;
};

// creates a new function in the underscore.js namespace
// allowing us to pluck multiple properties - used to return only the
// fields we require from an array of objects
_.mixin({selectFields: function() {
        var args = _.rest(arguments, 1)[0];
        return _.map(arguments[0], function(item) {
            var obj = {};
            _.each(args.split(','), function(arg) {
                obj[arg] = item[arg];
            });
            return obj;
        });
    }
});

/**
 * Creates a new DataHelper for fetching data from datasource endpoints
 * @class
 */
var DataHelper = function(datasource, requestUrl) {
  this.datasource = _.clone(datasource);
  this.requestUrl = requestUrl;
  this.dataCache = new DatasourceCache(this.datasource, requestUrl);

  var self = this;

  self.options = {
    host: self.datasource.source.host || config.get('api.host'),
    port: self.datasource.source.port || config.get('api.port'),
    path: self.datasource.endpoint,
    method: 'GET',
    agent: self.keepAliveAgent()
  };
}

module.exports.getStaticData = function(datasource, done) {

    var data = datasource.source.data;

    if (_.isArray(data)) {
        var sortField = datasource.schema.datasource.sort.field;
        var sortDir = datasource.schema.datasource.sort.order;
        var search = datasource.schema.datasource.search;
        var count = datasource.schema.datasource.count;
        var fields = datasource.schema.datasource.fields;

        if (search) data = _.where(data, search);
        if (sortField) data = _.sortBy(data, sortField);
        if (sortDir === 'desc') data = data.reverse();

        if (count) data = _.first(data, count);

        if (fields) data = _.chain(data).selectFields(fields.join(",")).value();
    }

    done(data);
}

DataHelper.prototype.load = function(done) {
    var self = this;

    this.dataCache.getFromCache(function (cachedData) {
        if (cachedData) return done(null, cachedData);

        if (self.datasource.source.type === 'static') {
            return self.getStaticData(function(data) {
                return done(null, data);
            });
        }

        self.getHeaders(function(err, headers) {
            if (err) {
              return done(err);
            }

            _.extend(self.options, headers);

            log.info({module: 'helper'}, "GET datasource '" + self.datasource.schema.datasource.key + "': " + self.options.path);

            var request = http.request(self.options, function(res) {
              var output = '';

              var encoding = res.headers['content-encoding'] ? res.headers['content-encoding'] : '';

              if (encoding === 'gzip') {
                var gunzip = zlib.createGunzip();
                var buffer = [];

                gunzip.on('data', function(data) {
                  buffer.push(data.toString());
                }).on('end', function() {
                  output = buffer.join("");
                  self.processOutput(res, output, function(err, data, res) {
                    return done(null, data, res);
                  });
                }).on('error', function(err) {
                  done(err);
                });

                res.pipe(gunzip);
              }
              else {
                res.on('data', function(chunk) {
                  output += chunk;
                });

                res.on('end', function() {
                  self.processOutput(res, output, function(err, data, res) {
                    return done(null, data, res);
                  });
                });
              }
            });

            request.on('error', function(err) {
              var message = err.toString() + '. Couldn\'t request data from ' + self.datasource.endpoint;
              err.name = 'GetData';
              err.message = message;
              err.remoteIp = self.options.host;
              err.remotePort = self.options.port;
              return done(err);
            });

            request.end();
        });
    });
}

DataHelper.prototype.processOutput = function(res, data, done) {
  // Return a 202 Accepted response immediately,
  // along with the datasource response
  if (res.statusCode === 202) {
    return done(null, JSON.parse(data), res);
  }

  // if the error is anything other than
  // Success or Bad Request, error
  if (!/200|400/.exec(res.statusCode)) {
    var err = new Error();
    err.message = 'Datasource "' + this.datasource.name + '" failed. ' + res.statusMessage + ' (' + res.statusCode + ')' + ': ' + this.datasource.endpoint;
    if (data) err.message += '\n' + data;

    err.remoteIp = self.options.host;
    err.remotePort = self.options.port;

    log.error(res.statusMessage + ' (' + res.statusCode + ')' + ": " + this.datasource.endpoint);
    //return done(err);
    throw(err);
  }

  // Cache 200 responses
  if (res.statusCode === 200) {
    this.dataCache.cacheResponse(data, function() {});
  }

  return done(null, data);
}

DataHelper.prototype.getHeaders = function(done) {
  if (this.datasource.authStrategy){
    this.datasource.authStrategy.getToken(this.datasource, function (err, token){
      if (err) return done(err);
      return done(null, { headers: { 'Authorization': 'Bearer ' + token, 'accept-encoding': 'gzip' } } );
    });
  }
  else {
    return done(null, { headers: { 'Authorization': 'Bearer ' + token.authToken.accessToken, 'accept-encoding': 'gzip' } } );
  }
}

DataHelper.prototype.keepAliveAgent = function() {
  return new http.Agent({ keepAlive: true });
}

module.exports.DataHelper = DataHelper;
