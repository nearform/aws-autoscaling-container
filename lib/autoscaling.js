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
var aws = require('aws-sdk');
var async = require('async');
var notifications = require('./notifications');
var _ = require('lodash');


module.exports = function (logger) {
  'use strict';

  var pollErrCount = 0;

  var pollInstanceStart = function(ec2, instanceId, cb) {
    var specific;
    logger.info('poll instance start: ' + instanceId);
    pollErrCount = 0;
    ec2.describeInstances({InstanceIds: [instanceId]}, function(err, data) {
      if (err) {
        if (pollErrCount > 5) {
          return cb(err);
        }
        else {
          pollErrCount++;
          setTimeout(function() { pollInstanceStart(ec2, instanceId, cb); }, 2000);
        }
      }
      var inst = data.Reservations[0].Instances[0];
      if (inst.State.Name === 'running') {
        specific = {imageId: inst.ImageId,
                    instanceId: inst.InstanceId,
                    publicIpAddress: inst.PublicIpAddress,
                    privateIpAddress: inst.PrivateIpAddress,
                    securityGroups: inst.SecurityGroups,
                    tags: inst.Tags};
        cb(null, specific);
      }
      else {
        if (pollErrCount > 20) {
          return cb(new Error('unable to start AWS machine'));
        }
        pollErrCount++;
        setTimeout(function() { pollInstanceStart(ec2, instanceId, cb); }, 2000);
      }
    });
  };

  function create (config, mode, target, system, containerDef, container, out, cb) {
    var autoscaling = new aws.AutoScaling(config);
    var ec2 = new aws.EC2(config);
    var imageId = container.specific.ImageId || config.defaultImageId;
    var groupName = system.name + '-' + system.topology.name + '-' + container.id + '-' + imageId;
    var launchName = 'lc-' + groupName;
    var setupNotifications = notifications(config, logger);

    var c = _.find(system.topology.containers, function (cont) {
      return cont.id === container.id;
    });

    var getParamFromAncestors = function (container, paramName, cb) {
      var parent = _.find(system.topology.containers, function (cont) {
        return cont.id === container.containedBy;
      });
      if (parent.id === container.id) {
        return cb(new Error('Cannot find param ' + paramName + ' in ancestors containers'));
      }
      if (parent[paramName]) {
        return cb(null, parent[paramName]);
      }

      return getParamFromAncestors(parent, paramName, cb);
    };

    var createLaunchConfiguration = function (cb) {
      var spec = container.specific;
      getParamFromAncestors(c, 'groupId', function (err, groupId) {
        if (err) {
          return cb(err);
        }

        var params = {
          LaunchConfigurationName: config.defaultLaunchName || launchName,
          ImageId: imageId,

          InstanceType: spec.InstanceType || config.defaultInstanceType, // this need to be configurable
          SecurityGroups: [
            groupId
          ]
        };
        return autoscaling.createLaunchConfiguration(params, cb);
      });
    };

    var describeLaunchConfiguration = function (cb) {
      var params = {
        LaunchConfigurationNames: [
          launchName
        ],
        MaxRecords: 1
      };
      autoscaling.describeLaunchConfigurations(params, cb);
    };

    var fetchELBId = function (container) {
      if (container.type === 'aws-elb') {
        return container.id;
      }

      var parent = _.find(system.topology.containers, function (cont) {
        return cont.id === container.containedBy;
      });

      return fetchELBId(parent);
    };

    var createAutoscalingGroup = function (cb) {
      var tags = container.specific.tags || [];
      tags = tags.concat([
        {
          Key: 'Name',
          PropagateAtLaunch: false,
          Value: container.id
        },
        {
          Key: 'nscale-id', /* required */
          PropagateAtLaunch: false, // the id is only for the group
          Value: system.name + '-' + system.topology.name + '-' + container.id
        },
        {
          Key: 'nscale-system', /* required */
          PropagateAtLaunch: true, // all instances are part of this
          Value: system.name + '-' + system.topology.name
        }
      ]);

      var loadBalancerName = fetchELBId(c);
      logger.info({ loadBalancerName: loadBalancerName }, 'LoadBalancerName');

      var loadBalancerNames = [];
      if (loadBalancerName) {
        loadBalancerNames.push(loadBalancerName);
      }

      var params = {
        AutoScalingGroupName: groupName,
        MaxSize: 3, /* required */
        MinSize: 1,
        HealthCheckGracePeriod: 10 * 60, // 10 minutes, might be 5?
        HealthCheckType: loadBalancerName? 'ELB' : 'EC2', // EC2 if a parent ELB could not be found
        LaunchConfigurationName: launchName,
        LoadBalancerNames: loadBalancerNames,
        Tags: tags,
        VPCZoneIdentifier: container.specific.SubnetId || config.defaultSubnetId
      };
      logger.info(params, 'createAutoscalingGroup');
      autoscaling.createAutoScalingGroup(params, cb);
    };

    var waitForInstance = function (cb) {
      var params = {
        AutoScalingGroupNames: [
          config.defaultGroupName || groupName
        ],
        MaxRecords: 1
      };

      var count = 0;

      return pollAGStartIstance();

      function pollAGStartIstance() {
        autoscaling.describeAutoScalingGroups(params, function (err, result) {
          if (err) {
            return cb(err);
          }

          logger.info(result, 'fetched autoscaling group');

          var ag = result.AutoScalingGroups[0];

          if (!ag) {
            return cb(new Error('the autoscaling group was not created'));
          }

          if (ag.Instances.length === 0 || ag.Instances[0].LifecycleState !== 'InService') {
            logger.info({ groupName: groupName, count: count }, 'no instance started yet, keep polling');

            if (++count === 50) { // 5 minutes
              return cb(new Error('no instance created'));
            }

            return setTimeout(pollAGStartIstance, 6000);
          }

          var instanceId = ag.Instances[0].InstanceId;

          logger.info({ InstanceId: instanceId }, 'waiting for instance');

          pollInstanceStart(ec2, instanceId, function(err, specific) {
            if (err) {
              return cb(err);
            }

            var child = system.topology.containers[container.contains[0]];

            if (child) {
              logger.info({ id: container.contains[0], specific: specific }, 'Updating specific of child');
              child.specific = specific;
              cb();
            } else {
              cb(new Error('no child to update'));
            }
          });
        });
      }
    };

    function addNotifications (cb) {
      return setupNotifications(config.defaultGroupName || groupName, cb);
    }

    async.series([
        createLaunchConfiguration,
        describeLaunchConfiguration,
        createAutoscalingGroup,
        addNotifications,
        waitForInstance
      ], function (err, data) {
        if (err) {
          return cb(err);
        }
        cb(null, system);
      }
    );
  }

  return {
    create: create
  };
};
