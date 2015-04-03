var AWS = require('aws-sdk');
var async = require('async');
var bunyan = require('bunyan');

module.exports = function queue (config, queueUrl, onMessage, logger) {
  'use strict';
  logger = logger || bunyan.createLogger({name: 'sqs-receiver'});

  var sqs = new AWS.SQS(config);
  var pleaseStop = true;
  var stopped = true;

  function receiveMessage (cb) {
    var params = {
      MaxNumberOfMessages: 1,
      VisibilityTimeout: 60 * 5,  // number of seconds before the message goes back to the queue
      WaitTimeSeconds: 20,
      QueueUrl: queueUrl
    };

    return sqs.receiveMessage(params, cb);
  }

  function deleteMessage (receiptHandle, cb) {
    return sqs.deleteMessage({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle
    }, cb);
  }

  function notifyEmpty () {
    logger.debug('Empty queue');
  }

  function notifyStopped () {
    stopped = true;
    logger.debug('Stopping the receiver');
  }

  function notifyMessage (message, cb) {
    //sendMessage and on callback delete it
    onMessage(message.Body, function (err, result) {
      if (err) {
        return cb(err);
      }
      return deleteMessage(message.ReceiptHandle, cb);
    });
  }

  function readQueue (args) {
    stopped = false;

    return async.waterfall([
      function fetchSQSMessage(next) {
        return receiveMessage(next);
      },
      function extractMessages(queue, next) {
        if (!queue.Messages) {
          notifyEmpty();
          return next(null);
        }

        return async.eachSeries(queue.Messages, function(message, next) {
          try {
            message.Body = JSON.parse(message.Body);
          } catch (e) {
            return next('Message ' + message + 'is not JSON');
          }

          return notifyMessage(message, next);
        }, function () {
          return next(null);
        });
      }
    ], function (err) {
      if (err) {
        logger.error(err);
      }

      if (pleaseStop) {
        return notifyStopped();
      }

      return async.nextTick(function() {
        return readQueue(args);
      });
    });
  }


  function start () {
    if (pleaseStop) {
      pleaseStop = false;
      readQueue({});
    }
    return ! stopped;
  }

  function stop () {
    if (stopped) {
      notifyStopped();
    }
    pleaseStop = true;
    return stopped;
  }


  return  {
    start: start,
    stop: stop
  };

};
