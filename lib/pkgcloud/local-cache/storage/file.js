/**
 * Created by Wizarth on 6/08/2016.
 */
var util = require('util');

var baseFile = require('../../core/storage/file').File;

/* Container and File are informative classes.
 * All functionality calls through to the Client instance that created the Container/File instance.
 * Need to inherit from pkgcloud/core/storage/container|file
 *   Actually should probably inherit from the backing modules implementation, but I can't think how to do that.
 * then override _setProperties
 */
var File = exports.File = function(client, details){
  baseFile.call(this, client, details);
};
util.inherits(File, baseFile);

File.prototype._setProperties = function(details)
{
  this.name = details.name;
  this.container = details.container;
};
