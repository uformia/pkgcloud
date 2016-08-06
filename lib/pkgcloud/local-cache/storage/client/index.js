/**
 * Created by Wizarth on 3/08/2016.
 */
var util = require('util');
var async = require('async');
var pkgcloud = require('pkgcloud');
var baseClient = require('../../../core/base').Client;
var baseContainer = require('../container').Container;
var baseFile = require('../file').File;

var CachingStream = require('./CachingStream').CachingStream;

/**
 * Local cache Client
 *
 * @type {Client}
 * @constructor
 *
 * @param {Object} options
 * @param {Object} options.backing          Options to provide to backing provider
 * @param {string} options.backing.provider  backing provider to use
 *
 * @todo options should include where to cache to.
 */
var Client = exports.Client = function(options) {
  baseClient.call(this, options);

  if( !options || !options['backing'] || !options['backing']['provider'] )
    throw new Error("backing option required");

  /* Client config common to all services */
  /* Containers functions
   * getContainers
   * getContainer
   * createContainer
   * destroyContainer
   */
  /* Files functions
   * removeFile
   * upload
   * download
   * getFile
   * getFiles
   */

  /* Create/connect/configure the backing store */
  /**
   * Backing provider.
   * @private
   */
  this._backingClient = pkgcloud.providers[options['backing']['provider']].storage.createClient(options["backing"]);

  /* Only upload/download functionality is going to be implemented. All other functionality maps back to the backing
      store.
     This MIGHT mean that doing things like getFiles with in-transit resources is unreliable, but this is the case
      anyway.
   */

  /**
   * @typedef {object<string,CachingStream>} FilesInProgress
   */

  /**
   * @typedef {object<string,FilesInProgress>} ContainersInProgress
   */

  /**
   * Maps containers to files to in-progress tracking information.
   * @type {ContainersInProgress}
   * @private
   */

  this._inProgress = {};
};

util.inherits(Client,baseClient);

Client.prototype.getContainers = function(callback)
{
  this._backingClient.getContainers(callback);
};

Client.prototype.getContainer = function(container, callback) {
  this._backingClient.getContainer(container,callback);
};

Client.prototype.createContainer = function(options, callback) {
  this._backingClient.createContainer(options, callback);
};

Client.prototype.destroyContainer = function(container, callback) {
  this._backingClient.destroyContainer(container, callback);
};

Client.prototype.removeFile = function(container, file, callback) {
  this._backingClient.removeFile(container, file, callback);
};

/**
 *
 * @param {string|Container} container
 * @param {string} file
 * @param callback
 */
Client.prototype.getFile = function(container, file, callback) {
  // Check if the file is _inProgress
  /** @type {string}
   * @const
   */
  var containerName = container instanceof baseContainer ? container.name : container;
  if( this._inProgress[containerName] && this._inProgress[containerName][file])
  {
    // It might be better behaviour to call this on nextTick
    callback( null, new baseFile(this, {
      container: container,
      name: file
    }));
  } else {
    this._backingClient.getFile(container, file, callback);
  }
};

Client.prototype.getFiles = function(container, options, callback)
{
  var self = this;
  this._backingClient.getFiles(container, options, function(err, files) {
    if( err ){
      callback(err, files);
      return;
    }
    // Ensure any files in _inProgress are in the listing as well
    var containerName = container instanceof baseContainer ? container.name : container;
    if(self._inProgress[containerName])
    {
      // We COULD depend on getFile returning instantly if it's an _inProgress entry, but it's bad practice and
      // if that behaviour changes (e.g. calling on nextTick) then it would break.
      async.each(Object.keys(self._inProgress[containerName]),
        function iteratee(key, callback) {
          files.push(self.getFile(
            containerName, key, function(err, file) {
              if(err) {
                callback(err)
              } else {
                files.push(file);
                callback();
              }
            }
          ))
        }, function iterateeComplete(err) {
          if( err )
          {
            callback(err);
          } else {
            callback(null, files);
          }
        }
      );
    } else {
      callback(err, files);
    }
  });
};

/**
 *
 * @param {Object} options
 * @param {string|Container} options.container
 * @param {string|File} options.remote
 */
Client.prototype.upload = function( options ) {
  this.touchFile(options);

  /** @type {string}
   * @const
   */
  var container = options.container instanceof baseContainer ? options.container.name : options.container;
  /** @type {string}
   * @const
   */
  var remote = options.remote instanceof baseFile ? options.remote.name : options.remote;

  return this._inProgress[container][remote];
};

/**
 *
 * @param {Object} options
 * @param {string|Container} options.container
 * @param {string|File} options.remote
 * @return {ReadStream}
 */
Client.prototype.download = function( options ) {
  this.touchFile(options);

  /** @type {string}
   * @const
   */
  var container = options.container instanceof baseContainer ? options.container.name : options.container;
  /** @type {string}
   * @const
   */
  var remote = options.remote instanceof baseFile ? options.remote.name : options.remote;

  return this._inProgress[container][remote].getReadStream();
};

/**
 * Provides a way to indicate a file is going to be uploaded "soon" and any download requests for it should hold for
 * the upload to start.
 * @param {Object} options
 * @param {string|Container} options.container
 * @param {string|File} options.remote
 */
Client.prototype.touchFile = function( options ) {
  /** @type {string}
   * @const
   */
  var container = options.container instanceof baseContainer ? options.container.name : options.container;
  /** @type {string}
   * @const
   */
  var remote = options.remote instanceof baseFile ? options.remote.name : options.remote;

  this._inProgress[container] = this._inProgress[container] || {};
  if( !this._inProgress[container][remote] )
  {
    var stream = new CachingStream();
    stream.on('finish', function() {
      stream.emit('success', new baseFile( {
        container: options.container,
        name: remote
      }))
    });

    this._inProgress[container][remote] = stream;
  }
};

