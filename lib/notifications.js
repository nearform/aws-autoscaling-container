'use strict';

var aws = require('aws-sdk');
var async = require('async');
var bunyan = require('bunyan');

module.exports = function (config, logger) {
  logger = logger || bunyan.createLogger({name: 'autoscaling-notifications'});

  var sns = new aws.SNS(config);
  var sqs = new aws.SQS(config);
  var autoScaling = new aws.AutoScaling(config);

  var snsTopicName = 'sns-topic';

  var autoScalingNotificationTypes = {
    launch: "autoscaling:EC2_INSTANCE_LAUNCH",
    launch_error: "autoscaling:EC2_INSTANCE_LAUNCH_ERROR",
    terminate: "autoscaling:EC2_INSTANCE_TERMINATE",
    terminate_error: "autoscaling:EC2_INSTANCE_TERMINATE_ERROR",
    test: "autoscaling:TEST_NOTIFICATION"
  };

  function createSnsTopic (topicName, cb) {
    // The callback will be called with (err, data) where data can contain the TopicArn
    return sns.createTopic({Name: topicName}, cb);
  }

  function subscribeSnsTopicWithSqs (snsTopicArn, sqsQueueArn, cb) {
    return sns.subscribe({Protocol: 'sqs', TopicArn: snsTopicArn, Endpoint: sqsQueueArn}, cb);
  }

  function createSqsQueue (sqsQueueName, attributes, cb) {
    // The callback will be called with (err, data) where data can contain the QueueUrl
    if (typeof attributes === 'function') {
      cb = attributes;
      attributes = {};
    }

    return sqs.createQueue({QueueName: sqsQueueName, Attributes: attributes}, cb);
  }

  function getSqsQueueAttributes (sqsQueueUrl, attributeNames, cb) {
    // The callback will be called with (err, data) where data con contain a list of
    // attributes like [QueueArn, MessageRetentionPeriod, Policy, ...]
    // More here http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#getQueueAttributes-property
    // You can access them as data.Attributes.QueueArn
    if (typeof attributeNames ==='function') {
      cb = attributeNames;
      attributeNames = ['All'];
    }

    return sqs.getQueueAttributes({QueueUrl: sqsQueueUrl, AttributeNames: attributeNames}, cb);
  }

  function allowSnsToPublishOnSqs (notificatioName, sqsQueueUrl, sqsQueueArn, snsTopicArn, cb) {
    var policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Sid: notificatioName,
        Effect: "Allow",
        Principal: "*",
        Action: "sqs:SendMessage",
        Resource: sqsQueueArn,
        Condition: {
          ArnEquals: {
            "aws:SourceArn": snsTopicArn
          }
        }
      }]
    });

    var params = {
      Attributes: {
        Policy: policy
      },
      QueueUrl: sqsQueueUrl
    };
    sqs.setQueueAttributes(params, cb);
  }

  function setupNotificationConfiguration (notificatioName, snsTopicArn, cb) {
      // Setup a notification system for autoscaling groups
      var autoScalingParams = {
        AutoScalingGroupName: notificatioName,
        NotificationTypes: [
          autoScalingNotificationTypes.launch,
          autoScalingNotificationTypes.terminate,
          autoScalingNotificationTypes.launch_error,
          autoScalingNotificationTypes.terminate_error
        ],
        TopicARN: snsTopicArn
      };

      return autoScaling.putNotificationConfiguration(autoScalingParams, cb);
  }



  function setupNotifications (notificatioName, cb) {
      async.waterfall([
        function snsTopic (cb) {
          createSnsTopic(notificatioName, function  (err, data) {
            if (err) {
              return cb(err);
            }
            logger.debug('snsTopicData', data);
            cb(null, {snsTopicArn: data.TopicArn});
          });
        },
        function sqsQueue (notificationData, cb) {
          createSqsQueue(notificatioName, function (err, data) {
            if (err) {
              return cb(err);
            }
            logger.debug('sqsQueueData', data);
            notificationData.sqsQueueUrl = data.QueueUrl;
            cb(null, notificationData);
          });
        },
        function sqsQueueAttributes (notificationData, cb) {
          getSqsQueueAttributes(notificationData.sqsQueueUrl, function (err, data) {
            if (err) {
              return cb(err);
            }
            logger.debug('sqsQueueAttributes', data);
            notificationData.sqsQueueArn = data.Attributes.QueueArn;
            cb(null, notificationData);
          });
        },
        function subscribe (notificationData, cb) {
          var nData = notificationData;
          subscribeSnsTopicWithSqs(nData.snsTopicArn, nData.sqsQueueArn, function (err, data) {
            if (err) {
              return cb(err);
            }
            logger.debug('subscribeSnsTopicWithSqs', data);
            notificationData.subscriptionArn = data.SubscriptionArn;
            cb(null, notificationData);
          });
        },
        function setupAutoscalingNotification (notificationData, cb) {
          setupNotificationConfiguration(notificatioName, notificationData.snsTopicArn, function (err, data) {
            if (err) {
              return cb(err);
            }
            logger.debug('setupNotification', data);
            cb(null, notificationData);
          });
        },
        function setAutorization (notificationData, cb) {
          allowSnsToPublishOnSqs(
            notificatioName,
            notificationData.sqsQueueUrl,
            notificationData.sqsQueueArn,
            notificationData.snsTopicArn,
            function (err, data) {
              if (err) {
                return cb(err);
              }
              logger.debug('setAutorizationData', data);
              cb(null, notificationData);
          });
        }
      ], function (err, result) {
        cb(err, result);
      });
  }

  return {
    setupNotifications: setupNotifications
  };
};
