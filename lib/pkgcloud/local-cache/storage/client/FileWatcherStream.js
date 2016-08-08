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
   * The currently being used stream.
   * This is created in paused mode and never taken out of it.
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

  /**
   * At various points, this stream could have been asked for data, but it doesn't have it available yet.
   * When this is the case, this variable will be set to a callback that can be invoked when data is available.
   * @type {?function}
   * @private
   */
  this._readCallback = null;

  this._readCallbackTimeout = null;

  this._readCallbackNextTick = false;

  this._buffer = [];

  this._readFile();

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
  if( this._readstream )
    return;

  this._readstream = fs.createReadStream(this._path, {
    start: this._offset
  });

  this._readstream.on('error', this._handleReadError.bind(this));
  this._readstream.on('end', this._handleReadEnd.bind(this));
  this._readstream.on('data', this._handleReadData.bind(this));
};

FileWatcherStream.prototype._handleReadError = function(error)
{
  // Errors do not necessarily end the stream
  console.log('FileWatcherStream._handleReadError');
  console.log(error);
  error.stack && console.log(error.stack);

  this.emit('error', error);
};

FileWatcherStream.prototype._handleReadData = function(data)
{
  this._buffer.push(data);
  this._offset += data.length;

  if( this._buffer.length > 100 )  // TODO: make this configurable
    this._readstream.pause();
  if( this._readCallback && !this._readCallbackNextTick)
  {
    this._readCallbackNextTick = true;
    process.nextTick(this._readCallback);
  }
};

FileWatcherStream.prototype._handleReadEnd = function() {
  this._readstream = null;
  if(this._readCallback && !this._readCallbackTimeout)
    this._readCallbackTimeout = setTimeout(this._readCallback,1000);
};

FileWatcherStream.prototype._handleWriteError = function(error)
{
  // Errors do not necessarily end the stream
  console.log('FileWatcherStream._handleWriteError');
  console.log(error);
  error.stack && console.log(error.stack);

  this.emit('error', error);
};

FileWatcherStream.prototype._handleWriteData = function()
{
  // For FileWatcherStream, the data event is just a notification, in case it had reached the end of the file
  // We are not responsible for writing the data to the file being watched
  // Call _readFile to ensure there is a stream (for the next call to _read)
  if(this._readCallback && !this._readCallbackTimeout)
    this._readCallbackTimeout = setTimeout( (function(){
      this._readFile();
      this._readCallbackNextTick = true;
      process.nextTick(this._readCallback);
    }).bind(this),1000);  // Wait a second. TODO: Make this wait period configurable

};

FileWatcherStream.prototype._handleWriteEnd = function()
{
  this._fileComplete = true;
  this._readFile();
  if(this._readCallback && !this._readCallbackNextTick)
  {
    this._readCallbackNextTick = true;
    process.nextTick(this._readCallback);
  }
};


FileWatcherStream.prototype._read = function(size) {
  clearTimeout( this._readCallbackTimeout);
  this._readCallbackTimeout = null;
  this._readCallbackNextTick = false;

  var chunk;
  do {
    /*
      This just returns BUFFERED data.
      If we have no bufferred data, we will either wait on an existing stream for more,
      create a new stream to catch any new data, or push(null) to indicate all the data is done.
     */
    if( this._buffer.length )
      chunk = this._buffer.shift();
    else
      chunk = null;
    if( !chunk )
    {
      // If we have a stream, we want to wait for it to give us more data
      if( this._readstream ) {
        if (!this._readCallback) {
          this._readCallback = this._read.bind(this, size);
        }

        // Just in case we paused it - assumes this is a no-op otherwise
        this._readstream.resume();

        return;
      } else {
        // We have no stream (which means we reached the end of the on-disk data)
        // If there is still more file to come, create a new stream.
        if( !this._fileComplete )
        {
          this._readFile();
          // Underlying stream doesn't have data yet, try again when it does
          // Set up a callback - called by various _handle* functions
          if (!this._readCallback) {
            this._readCallback = this._read.bind(this, size);
          }

          return;
        }
      }
    }
    // Had at least one successful read, so remove the callback
    this._readCallback = null;

  } while(this.push(chunk))
};
