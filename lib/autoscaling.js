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

module.exports = function (logger) {
  'use strict';

  var aws = require('aws-sdk');
  var async = require('async');
  var _ = require('lodash');

  function create (config, mode, target, system, containerDef, container, out, cb) {
    var autoscaling = new aws.AutoScaling(config);
    var launchName = 'lc-' + system.name + '-' + system.topology.name;
    var groupName = 'ag-' + system.name + '-' + system.topology.name;

    var c = _.find(system.topology.containers, function (cont) {
      return cont.id === container.id;
    });

    var getParamFromParents = function (container, paramName, cb) {
      var parent = _.find(system.topology.containers, function (cont) {
        return cont.id === container.containedBy;
      });
      if (parent.id === container.id) {
        return cb('Cannot find param ' + paramName + ' in ancestors containers');
      }
      if (parent.specific[paramName]) {
        return cb(null, parent.specific[paramName]);
      }

      return getParamFromParents(parent, paramName, cb);
    };

    var createLaunchConfiguration = function (cb) {
      var spec = container.specific;
      getParamFromParents(c, 'GroupId', function (err, groupId) {
        if (err) {
          return cb(err);
        }

        var params = {
          LaunchConfigurationName: config.defaultLaunchName || launchName,
          ImageId: spec.ImageId || config.defaultImageId,  // this need to be configurable

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
          config.defaultLaunchName || launchName
        ],
        MaxRecords: 1
      };
      autoscaling.describeLaunchConfigurations(params, cb);
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
          },
          {
            Key: 'nscale-parent-group', /* required */
            PropagateAtLaunch: true, // the id is only for the group
            Value: groupName
          }
        ]);
        getParamFromParents(c, 'LoadBalancerName', function (err, loadBalancerName) {
          var loadBalancerNames = [];
          if (loadBalancerName) {
            loadBalancerNames.push(loadBalancerName);
          }
          var params = {
            AutoScalingGroupName: config.defaultGroupName || groupName,
            MaxSize: 3, /* required */
            MinSize: 1,
            HealthCheckGracePeriod: 3 * 60, // three minutes, might be 5?
            HealthCheckType: loadBalancerName ? 'ELB' : 'EC2', // EC2 if a parent ELB could not be found
            LaunchConfigurationName: config.defaultLaunchName || launchName,
            LoadBalancerNames: loadBalancerNames,
            Tags: tags,
            VPCZoneIdentifier: config.defaultSubnetId
          };
          autoscaling.createAutoScalingGroup(params, cb);
        });
    };

    var describeAutoscalingGroup = function (cb) {
      var params = {
        AutoScalingGroupNames: [
          config.defaultGroupName || groupName
        ],
        MaxRecords: 1
      };
      autoscaling.describeAutoScalingGroups(params, cb);
    };

    async.series([
        createLaunchConfiguration,
        describeLaunchConfiguration,
        createAutoscalingGroup,
        describeAutoscalingGroup
      ], function (err, data) {
        if (err) {
          return cb(err);
        }
        cb();
      }
    );
  }

  return {
    create: create
  };
};
