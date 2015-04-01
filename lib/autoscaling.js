var aws = require('aws-sdk');
var bunyan = require('bunyan');

module.exports = function (config, logger) {
  'use strict';

  logger = logger || bunyan.createLogger({name:'autoscaling-module'});

  var autoscaling = new aws.AutoScaling(config);


  var createLaunchConfiguration = function (imageId, securityGroups, launchConfigurationName, instanceType, cb) {
    var params = {
      LaunchConfigurationName: launchConfigurationName,
      ImageId: imageId,
      InstanceType: instanceType, // this need to be configurable
      SecurityGroups: securityGroups
    };
    logger.info('createLaunchConfiguration', params);
    return autoscaling.createLaunchConfiguration(params, cb);
  };


  var createAutoScalingGroup = function (autoScalingGroupName, healthCheckType, launchConfigurationName, loadBalancerNames, vpcZoneIdentifier, tags, cb) {
    // tags is an array of object like
    // {
    //   Key: 'Name',
    //   PropagateAtLaunch: false,
    //   Value: 'Value'
    // }

    var params = {
      AutoScalingGroupName: autoScalingGroupName,
      MaxSize: 3, /* required */
      MinSize: 1,
      HealthCheckGracePeriod: 10 * 60, // 10 minutes, might be 5?
      HealthCheckType: healthCheckType, // EC2 if a parent ELB could not be found
      LaunchConfigurationName: launchConfigurationName,
      LoadBalancerNames: loadBalancerNames,
      VPCZoneIdentifier: vpcZoneIdentifier,
      Tags: tags
    };
    logger.info(params, 'createAutoScalingGroup');
    autoscaling.createAutoScalingGroup(params, cb);
  };


  var describeLaunchConfigurations = function (launchName, cb) {
    var params = {
      LaunchConfigurationNames: [
        launchName
      ],
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

  return {
    createLaunchConfiguration: createLaunchConfiguration,
    createAutoScalingGroup: createAutoScalingGroup,
    describeLaunchConfigurations: describeLaunchConfigurations,
    describeAutoScalingGroups: describeAutoScalingGroups
  };
};