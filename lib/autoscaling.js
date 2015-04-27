var aws = require('aws-sdk');
var bunyan = require('bunyan');

module.exports = function (config, logger) {
  'use strict';

  logger = logger || bunyan.createLogger({name:'autoscaling-module'});

  var autoscaling = new aws.AutoScaling(config);

  var createLaunchConfiguration = function (launchConfigurationName, imageId, securityGroups, instanceType, keyName, cb) {
    var params = {
      LaunchConfigurationName: launchConfigurationName,
      AssociatePublicIpAddress: true,
      ImageId: imageId,
      InstanceType: instanceType, // this need to be configurable
      SecurityGroups: securityGroups,
      KeyName: keyName
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

  var putScalingPolicy = function (autoScalingGroupName, policyName, scalingAdjustment, adjustmentType, cb) {

    if (typeof scalingAdjustment === 'function') {
      adjustmentType = scalingAdjustment;
      scalingAdjustment = 1;
    }

    if (typeof adjustmentType === 'function') {
      cb = adjustmentType;
      adjustmentType = 'ChangeInCapacity';
    }

    var scalingPolicyParams = {
      AutoScalingGroupName: autoScalingGroupName,
      PolicyName: policyName,
      AdjustmentType: adjustmentType,
      ScalingAdjustment: scalingAdjustment
    };

    autoscaling.putScalingPolicy(scalingPolicyParams, cb);

  };

  var getAutoScalingParams = function (autoScalingGroupName, cb) {
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

  var getLaunchConfigurationParams = function (launchConfigurationName, cb) {
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

  var createLaunchConfigurationAndGetParams = function (launchConfigurationName, imageId, securityGroups, instanceType, keyName, cb) {
    getLaunchConfigurationParams(launchConfigurationName, function (err, params) {
      if (err) {
        return cb(err);
      }
      if (params !== null) {
        return cb(null, params);
      }

      createLaunchConfiguration(launchConfigurationName, imageId, securityGroups, instanceType, keyName, function (err, params) {
        if (err) {
          return cb(err);
        }

        getLaunchConfigurationParams(launchConfigurationName, cb);
      });
    });
  };

  var createAutoScalingGroupAndGetParams = function (
    autoScalingGroupName, healthCheckType, launchConfigurationName,
    loadBalancerNames, vpcZoneIdentifier, tags, availabilityZones,
    minSize, maxSize, cb) {

    return getAutoScalingParams(autoScalingGroupName, function (err, params) {
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

        getAutoScalingParams(autoScalingGroupName, cb);
      });
    });
  };


  return {
    createLaunchConfiguration: createLaunchConfiguration,
    createAutoScalingGroup: createAutoScalingGroup,
    describeLaunchConfigurations: describeLaunchConfigurations,
    describeAutoScalingGroups: describeAutoScalingGroups,
    putScalingPolicy: putScalingPolicy,
    createLaunchConfigurationAndGetParams: createLaunchConfigurationAndGetParams,
    createAutoScalingGroupAndGetParams: createAutoScalingGroupAndGetParams
  };
};
