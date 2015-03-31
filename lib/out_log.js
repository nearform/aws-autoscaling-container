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

'use strict';


module.exports = function(logger) {
  var tickSize;
  var current;
  var _preview = [];
  var _plan;

  return {
    initProgress: function(steps, message) {
      logger.info(message);
    },

    plan: function(plan) {
      _plan = plan;
    },

    getPlan: function() {
      return _plan;
    },

    preview: function(op) {
      _preview.push(op);
    },

    operations: function() {
      return _preview;
    },

    progress: function(message) {
      logger.info(message);
    },

    response: function(json, cb) {
      logger.info(json, 'response');
      if (cb) { cb(); }
    },

    stdout: function(str, level) {
      logger.info('stdout: ' + str);
    },

    stderr: function(str, level) {
      logger.info('stderr: ' + str);
    }
  };
};