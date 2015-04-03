'use strict';
var config = require('../config.json');
var bunyan = require('bunyan');
var logger = bunyan.createLogger({name: 'sqs-receiver', level: 'debug'});

function onMessage (message, cb) {
  message.Message = JSON.parse(message.Message);
  console.log(message);
}

if (require.main === module) {
  var sqsQueueUrl = process.argv[2];
  if (sqsQueueUrl) {
    var sqsReceiver = require('../lib/sqs_receiver.js')(config, sqsQueueUrl, onMessage, logger);
    sqsReceiver.start();
  }
}