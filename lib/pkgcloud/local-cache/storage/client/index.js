/**
 * Created by Wizarth on 3/08/2016.
 */
var util = require('util');
var pkgcloud = require('pkgcloud');
var baseClient = require('../../../core/base').Client;

/**
 * Local cache Client
 *
 * @type {Client}
 * @constructor
 *
 * @param {Object} options
 * @param {string} options.backing          backing provider to use
 * @param {?Object} options.backingOptions  Options to provide to backing provider
 */
var Client = exports.Client = function(options) {
  baseClient.call(this, options);

  if( !options || !options['backing'] )
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
  this._backingClient = new pkgcloud.providers[options['backing']].createClient(options["backingOptions"]);

  /* Only upload/download functionality is going to be implemented. All other functionality maps back to the backing
      store.
     This MIGHT mean that doing things like getFiles with in-transit resources is unreliable, but this is the case
      anyway.
   */
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

Client.prototype.getFiles = function(container, options, callback)
{
  this._backingClient.getFiles(container, options, callback);
};

Client.prototype.upload = function( options ) {
  throw new Error("TODO: Implement");
};

Client.prototype.download = function( options ) {
  throw new Error("TODO: Implement");
};

