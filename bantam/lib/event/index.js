var fs = require('fs');

var config = require(__dirname + '/../../../config');
var log = require(__dirname + '/../log');

var Event = function (pageName, eventName, options) {
  if (!pageName) throw new Error('Page name required');

  this.log = log.get().child({module: 'event'});
  this.log.info('Event logging started (page: ' + pageName + ', event: ' + eventName + ').')

  this.page = pageName;
  this.name = eventName;
  this.options = options || {};
};

Event.prototype.loadEvent = function() {

  var filepath = this.options.eventPath + "/" + this.name + ".js";

  if (filepath && !fs.existsSync(filepath)) {
    throw new Error('Page "' + this.page + '" references event "' + this.name + '" which can\'t be found in "' + this.options.eventPath + '"');
  }

  try {
    // get the event
    return require(filepath);
  }
  catch (err) {
    throw new Error('Error loading event "' + filepath + '". ' + err);
  }
};

Event.prototype.run = function(req, res, data, done) {
  try {
    this.loadEvent()(req, res, data, function (err, result) {
      if (err) {
        this.log.error(err);
      }

      return done(err, result);
    });
  }
  catch (err) {
    this.log.error(err);
    return done(err, data);
  }
};

module.exports = function (pageName, eventName, options) {
  return new Event(pageName, eventName, options);
};

module.exports.Event = Event;
