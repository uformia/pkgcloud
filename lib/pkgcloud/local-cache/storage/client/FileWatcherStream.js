/**
 * Created by Wizarth on 6/08/2016.
 */
var util = require('util');
var fs = require('fs');
var stream = require('stream');


/**
 * This is loosely based off of https://github.com/felixge/node-growing-file
 * @param {string} path
 * @param {CachingStream} parent
 * @param {object} options
 * @constructor
 * @name FileWatcherStream
 */
var FileWatcherStream = exports.FileWatcherStream = function(path, parent, options )
{
  FileWatcherStream.super_.call(this, options );

  /**
   * @type {string}
   * @const
   * @private
   */
  this._path = path;

  /**
   * The currently being used stream
   * @type {?ReadStream}
   * @private
   */
  this._readstream = null;

  /**
   * Amount of file currently read.
   * @type {number}
   * @private
   */
  this._offset = 0;

  /**
   * Indicates if the file has been completed, or if there will be more data coming.
   * @type {boolean}
   * @private
   */
  this._fileComplete = false;

  /** Is the stream paused? Don't create the _readstream if paused, because our consumer won't expect data.
   * @type {boolean}
   * @private
   */
  this._paused = true;

  // Attach to events
  parent.on('error', this._handleWriteError.bind(this));
  parent.on('data', this._handleWriteData.bind(this));
  parent.on('end', this._handleWriteEnd.bind(this));
};

util.inherits(FileWatcherStream,stream.Readable);

/**
 * Creates a stream reading the file and sets up the appropriate event handlers
 * @private
 */
FileWatcherStream.prototype._readFile = function() {
  // If we already have a stream, we don't need another one
  // If we are paused, our consumer won't expect us to be producing data
  if( this._readstream || this._paused)
    return;

  this._readstream = fs.createReadStream(this._path, {
    start: this._offset
  });

  this._readstream.on('error', this._handleReadError.bind(this));
  this._readstream.on('data', this._handleReadData.bind(this));
  this._readstream.on('end', this._handleReadEnd.bind(this));
};

FileWatcherStream.prototype._handleReadError = function(error)
{
  // Errors do not necessarily end the stream
  this.emit('error', error);
};

FileWatcherStream.prototype._handleReadData = function(data)
{
  this._offset += data.length;
  this.emit('data', data);
};

FileWatcherStream.prototype._handleReadEnd = function() {
  this._readstream = null;
  if( this._fileComplete )
    this.emit('end');
};

FileWatcherStream.prototype.end = function() {
  this._handleReadEnd();
};

FileWatcherStream.prototype._handleWriteError = function(error)
{
  // Errors do not necessarily end the stream
  this.emit('error', error);
};

FileWatcherStream.prototype._handleWriteData = function(data)
{
  // For FileWatcherStream, the data event is just a notification, in case it had reached the end of the file
  // We are not responsible for writing the data to the file being watched
  this._readFile();
};

FileWatcherStream.prototype._handleWriteEnd = function()
{
  this._fileComplete = true;
  // Trigger creating a new stream if appropriate (if we reached the end of the file, but didn't know yet)
  // This results in triggering _handleReadEnd
  this._readFile();
};

FileWatcherStream.prototype.pause = function() {
  this._readstream && this._readstream.pause();
  this._paused = true;
};

FileWatcherStream.prototype.resume = function() {
  this._readstream && this._readstream.resume();
  this._paused = false;
  // Trigger creating a new stream if appropriate (if we were paused because reaching the end of the file, and new data
  // being added)
  this._readFile();
};
