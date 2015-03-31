'use strict';
var config = require('../config.json');
var bunyan = require('bunyan');
var logger = bunyan.createLogger({name: 'autoscaling-notifications', level: 'debug'});
var notifications = require('../lib/notifications.js')(config, logger);
var setupNotifications = notifications.setupNotifications;

if (require.main === module) {
  var autoScalingGroupName = process.argv[2];
  if (autoScalingGroupName) {
    setupNotifications(autoScalingGroupName, function (err, result) {
      if (err) {
        return bunyan.error(err, err.stack);
      }
      bunyan.info(result);
    });
  }
}