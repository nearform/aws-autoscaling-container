var aws = require('aws-sdk');
var bunyan = require('bunyan');

module.exports = function (config, logger) {
  'use strict';

  logger = logger || bunyan.createLogger({name:'autoscaling-module'});

  var autoscaling = new aws.AutoScaling(config);

  var createLaunchConfiguration = function (launchConfigurationName, imageId, securityGroups, instanceType, cb) {
    var params = {
      LaunchConfigurationName: launchConfigurationName,
      ImageId: imageId,
      InstanceType: instanceType, // this need to be configurable
      SecurityGroups: securityGroups
    };
    logger.info('createLaunchConfiguration', params);
    return autoscaling.createLaunchConfiguration(params, cb);
  };


  var createAutoScalingGroup = function (
    autoScalingGroupName, healthCheckType, launchConfigurationName,
    loadBalancerNames, vpcZoneIdentifier, tags, availabilityZones,
    minSize, maxSize, cb) {
    // tags is an array of object like
    // {
    //   Key: 'Name',
    //   PropagateAtLaunch: false,
    //   Value: 'Value'
    // }

    var params = {
      AutoScalingGroupName: autoScalingGroupName,
      MaxSize: maxSize, /* required */
      MinSize: minSize,
      HealthCheckGracePeriod: 10 * 60, // 10 minutes, might be 5?
      HealthCheckType: healthCheckType, // EC2 if a parent ELB could not be found
      LaunchConfigurationName: launchConfigurationName,
      LoadBalancerNames: loadBalancerNames,
      VPCZoneIdentifier: vpcZoneIdentifier,
      Tags: tags
    };

    if (availabilityZones !== null) {
      params.AvailabilityZones = availabilityZones;
      params.VPCZoneIdentifier = null;
    }

    logger.info(params, 'createAutoScalingGroup');
    autoscaling.createAutoScalingGroup(params, cb);
  };


  var describeLaunchConfigurations = function (launchConfigurationNames, cb) {
    var params = {
      LaunchConfigurationNames: launchConfigurationNames,
      MaxRecords: 1
    };
    logger.info(params, 'describeLaunchConfigurations');
    autoscaling.describeLaunchConfigurations(params, cb);
  };

  var describeAutoScalingGroups = function (autoScalingGroupNames, cb) {
    var params = {
      AutoScalingGroupNames: autoScalingGroupNames,
      MaxRecords: 1
    };

    logger.info(params, 'describeAutoScalingGroups');
    autoscaling.describeAutoScalingGroups(params, cb);
  };

  var autoScalingParams = function (autoScalingGroupName, cb) {
    describeAutoScalingGroups([autoScalingGroupName], function (err, result) {
      if (err) {
        return cb(err);
      }
      if (result.AutoScalingGroups.length > 0) {
        return cb(null, result.AutoScalingGroups[0]);
      } else {
        return cb(null, null);
      }
    });
  };

  var launchConfigurationParams = function (launchConfigurationName, cb) {
    describeLaunchConfigurations([launchConfigurationName], function (err, result) {
      if (err) {
        return cb(err);
      }
      if (result.LaunchConfigurations.length > 0) {
        return cb(null, result.LaunchConfigurations[0]);
      } else {
        return cb(null, null);
      }
    });
  };

  var createLaunchConfigurationAndGetParams = function (launchConfigurationName, imageId, securityGroups, instanceType, cb) {
    launchConfigurationParams(launchConfigurationName, function (err, params) {
      if (err) {
        return cb(err);
      }
      if (params !== null) {
        return cb(null, params);
      }

      createLaunchConfiguration(launchConfigurationName, imageId, securityGroups, instanceType, function (err, params) {
        if (err) {
          return cb(err);
        }

        launchConfigurationParams(launchConfigurationName, cb);
      });
    });
  };

  var createAutoScalingGroupAndGetParams = function (
    autoScalingGroupName, healthCheckType, launchConfigurationName,
    loadBalancerNames, vpcZoneIdentifier, tags, availabilityZones,
    minSize, maxSize, cb) {

    return autoScalingParams(autoScalingGroupName, function (err, params) {
      if (err) {
        return cb(err);
      }
      if (params !== null) {
        return cb(null, params);
      }

      createAutoScalingGroup(autoScalingGroupName, healthCheckType,
        launchConfigurationName, loadBalancerNames, vpcZoneIdentifier,
        tags, availabilityZones, minSize, maxSize, function (err, params) {

        if (err) {
          return cb(err);
        }

        autoScalingParams(autoScalingGroupName, cb);
      });
    });
  };


  return {
    createLaunchConfiguration: createLaunchConfiguration,
    createAutoScalingGroup: createAutoScalingGroup,
    describeLaunchConfigurations: describeLaunchConfigurations,
    describeAutoScalingGroups: describeAutoScalingGroups,
    createLaunchConfigurationAndGetParams: createLaunchConfigurationAndGetParams,
    createAutoScalingGroupAndGetParams: createAutoScalingGroupAndGetParams
  };
};