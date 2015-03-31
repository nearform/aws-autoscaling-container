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
      VisibilityTimeout: 40,
      WaitTimeSeconds: 3,
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
    onMessage(message, function (err, result) {
      // TODO: handle error
      return deleteMessage(message._message.ReceiptHandle, cb);
    });
  }

  function adaptMessage (message) {
    message.Body._message = message;
    return message;
  }

  function readQueue (args) {
    stopped = false;

    return async.waterfall([
      function fetchSQSMessage(next) {
        return receiveMessage(args, next);
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

          return notifyMessage(adaptMessage(message), next);
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
