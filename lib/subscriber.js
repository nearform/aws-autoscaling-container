/*
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';
var sqsReceiver = require('./sqs_receiver');
var notifications = require('./notifications');
var buildOut = require('./out_log');
var _ = require('lodash');
var async = require('async');

function configSubscriber(config, logger) {

  var server = {
    start: start,
    close: close,
    subscribe: subscribe
  };

  var _api;
  var _sysRev;
  var _loadConfig;
  var receivers = {};

  function start(root, api, sysRev, loadConfig, cb) {
    // we need sysRev to list all the known systems
    // loadConfig to get the credentials
    // and api to actually trigger a fix
    // yes, it is a mess

    _api = api;
    _sysRev = sysRev;
    _loadConfig = loadConfig;

    // for all systems
    async.eachSeries(_sysRev.listSystems(), function(sysMeta, cb) {
      // we get the deployed environments
      _sysRev.getDeployedTargets(sysMeta.id, function(err, targets) {
        if (err) { return cb(err); }

        async.eachSeries(targets, function(target, cb) {
          // we fetch the actual system for that revision
          _sysRev.getRevision(sysMeta.id, target.commit, target.env, function(err, system) {
            if (err) { return cb(err); }

            var isAutoscaling = _.some(system.topology.containers, function(cont) {
              return cont.type === 'aws-autoscaling';
            });

            if (!isAutoscaling) {
              logger.debug(sysMeta, 'no autoscaling');
              return cb();
            }

            system.repoPath = _sysRev.repoPath(sysMeta.id);

            loadConfig(system, function(err, config) {
              if (err) { return cb(err); }

              var getSqsQueueUrl = notifications(config, logger).getSqsQueueUrl;

              getSqsQueueUrl('nscale-' + system.name + '-' + system.topology.name, function(err, sqsQueueUrl) {
                if (err) {
                  return cb(); // if there is no queue we just don't subscribe
                }
                subscribe(config, sqsQueueUrl, system.id, system.topology.name, cb);
              });
            });
          });
        }, cb);
      });
    }, function(err) {
      cb(err, server);
    });
  }

  function buildOnMessage (systemId, target, sqsQueueUrl) {
    var childLogger = logger.child({
      systemId: systemId,
      target: target,
      sqsQueueUrl: sqsQueueUrl
    });
    var out = buildOut(childLogger);
    // we need a user
    var user = {
      name: 'nscale aws autoscaling',
      email: 'info@nearform.com'
    };

    function onLaunch (message, cb) {
      logger.debug(message, 'EC2_INSTANCE_LAUNCH');
      _api.fixSystem(user, systemId, target, out, cb);
    }

    function logMessage (message, cb) {
      logger.debug(message, 'EC2_INSTANCE_EVENT');
      cb();
    }

    var eventHandlers = {
      'autoscaling:EC2_INSTANCE_LAUNCH': onLaunch,
      'autoscaling:EC2_INSTANCE_LAUNCH_ERROR': logMessage,
      'autoscaling:EC2_INSTANCE_TERMINATE': logMessage,
      'autoscaling:EC2_INSTANCE_TERMINATE_ERROR': logMessage,
      'autoscaling:TEST_NOTIFICATION': logMessage
    };

    return function onMessage (message, cb) {
      try {
        message.Message = JSON.parse(message.Message);
      } catch (e) {
        return logMessage(message, function () {
          cb(new Error('Message could not be parsed'));
        });
      }
      if (_.has(message.Message, 'Event') && _.has(eventHandlers, message.Message.Event)) {
        eventHandlers[message.Message.Event](message, cb);
      } else {
        cb(new Error('Unknown Message received'));
      }
    };
  }

  function subscribe(credentials, sqsQueueUrl, systemId, target, cb) {
    var onMessage = buildOnMessage(systemId, target, sqsQueueUrl);
    var receiver = sqsReceiver(credentials, sqsQueueUrl, onMessage, logger);
    receiver[sqsQueueUrl] = receiver;
    receiver.start();
    setImmediate(cb);
  }

  function close(cb) {
    _.each(receivers, function (receiver, queueUrl) {
      logger.info("Stopping queue " + queueUrl);
      receiver.stop();
    });
    setImmediate(cb);
  }

  return start;
}

module.exports = configSubscriber;
