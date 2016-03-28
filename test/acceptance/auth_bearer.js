var sinon = require('sinon');
var should = require('should');
var request = require('supertest');
// loaded customised fakeweb module
var fakeweb = require(__dirname + '/../fakeweb');
var http = require('http');
var proxyquire =  require('proxyquire');
var nock =  require('nock');
var url =  require('url');
var _ = require('underscore');

var Controller = require(__dirname + '/../../dadi/lib/controller');
var Datasource = require(__dirname + '/../../dadi/lib/datasource');
var Page = require(__dirname + '/../../dadi/lib/page');
var api = require(__dirname + '/../../dadi/lib/api');
var auth = require(__dirname + '/../../dadi/lib/auth');
var Server = require(__dirname + '/../../dadi/lib');
var help = require(__dirname + '/../help');
var libHelp = require(__dirname + '/../../dadi/lib/help');
var config = require(__dirname + '/../../config.js');

var clientHost = 'http://' + config.get('server.host') + ':' + config.get('server.port');
var apiHost = 'http://' + config.get('api.host') + ':' + config.get('api.port');

var token = JSON.stringify({
  "accessToken": "da6f610b-6f91-4bce-945d-9829cac5de71",
  "tokenType": "Bearer",
  "expiresIn": 1800
});

describe('Auth', function (done) {
  describe('Datasource', function (done) {

  before(function(done) {

    done();
  });

  beforeEach(function(done) {

    // intercept the api test at server startup
    sinon.stub(libHelp, "isApiAvailable").yields(null, true);

    done();
  });

  afterEach(function(done) {

    libHelp.isApiAvailable.restore();

    http.clear_intercepts();

    done();
  });

  it.skip('should return error if no token was obtained', function (done) {

    config.set('api.enabled', true);

    help.startServer(null, function() {
      setTimeout(function() {
        var client = request(clientHost);
        client
        .get('/test')
        .expect('content-type', 'text/html')
        .expect(500)
        .end(function (err, res) {
          if (err) return done(err);

          console.log(res)

          //(res.text.indexOf("Datasource authentication: No token received, invalid credentials for datasource") > -1).should.eql(true);

          help.stopServer(done);

        });
      }, 500);

    });

  });

  it('should not error if valid credentials are supplied and a token is returned', function (done) {

    config.set('api.enabled', true);
    config.set('allowJsonView', true);

    // first intercept is for the main auth
    var scope = nock('http://127.0.0.1:3000')
      .post('/token')
      .reply(200, {
        accessToken: 'xx'
      });

    var scope2 = nock('http://127.0.0.1:3000')
      .post('/token')
      .reply(200, {
        accessToken: 'xx'
      });

    var result = JSON.stringify({
      results: [
        {
          makeName: 'Ford'
        }
      ]
    });

    var scope3 = nock('http://127.0.0.1:3000')
      .post('/token')
      .reply(200, {
        accessToken: 'xx'
      });

    var dsEndpoint = 'http://127.0.0.1:3000/1.0/cars/makes?count=20&page=1&filter={}&fields={"name":1,"_id":0}&sort={"name":1}';
    var dsPath = url.parse(dsEndpoint).path;
    var scope4 = nock('http://127.0.0.1:3000')
      .get(dsPath)
      .reply(200, result);

    help.startServer(null, function() {

      setTimeout(function() {

        var client = request(clientHost);
        client
        .get('/test?json=true')
        .expect('content-type', 'application/json')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);

          var actual = JSON.stringify(res.body['car-makes-unchained']);
          var expected = JSON.stringify(JSON.parse(result));
          actual.should.eql(expected);

          help.stopServer(done);
        });
      }, 500);

    });

    });
  });
});
