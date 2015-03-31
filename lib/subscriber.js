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

function configSubscriber(config, logger) {

  var server = {
    start: start,
    close: close,
    subscribe: subscribe
  };

  var _api;
  var _sysRev;
  var _loadConfig;

  function start(root, api, sysRev, loadConfig, cb) {
    // we need sysRev to list all the known systems
    // loadConfig to get the credentials
    // and api to actually trigger a fix
    // yes, it is a mess

    _api = api;
    _sysRev = sysRev;
    _loadConfig = loadConfig;

    console.log('subscriber started');

    cb(null, server)
  }

  function subscribe(credentials, sqs, cb) {
    // FIXME
    cb();
  }

  function close(cb) {
    // FIXME
    setImmediate(cb);
  }

  return start;
}

module.exports = configSubscriber;
