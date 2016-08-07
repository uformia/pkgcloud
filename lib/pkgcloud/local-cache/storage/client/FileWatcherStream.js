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

  console.log('createReadStream');
  this._readstream = fs.createReadStream(this._path, {
    start: this._offset
  });

  this._readstream.on('error', this._handleReadError.bind(this));
  this._readstream.on('end', this._handleReadEnd.bind(this));
  // readable lets us know when the stream has some data in its buffer
  this._readstream.on('readable', this._handleReadable.bind(this));
};

FileWatcherStream.prototype._handleReadError = function(error)
{
  // Errors do not necessarily end the stream
  console.log('FileWatcherStream._handleReadError');
  console.log(error);
  error.stack && console.log(error.stack);

  this.emit('error', error);
};



FileWatcherStream.prototype._handleReadable = function() {
  if( this._readCallback)
    this._readCallback();
};

FileWatcherStream.prototype._handleReadEnd = function() {
  this._readstream = null;
  if(this._readCallback)
    this._readCallback();
};

FileWatcherStream.prototype._handleWriteError = function(error)
{
  // Errors do not necessarily end the stream
  console.log('FileWatcherStream._handleWriteError');
  console.log(error);
  error.stack && console.log(error.stack);

  this.emit('error', error);
};

FileWatcherStream.prototype._handleWriteData = function(data)
{
  // For FileWatcherStream, the data event is just a notification, in case it had reached the end of the file
  // We are not responsible for writing the data to the file being watched
  // Call _readFile to ensure there is a stream (for the next call to _read)
  this._readFile();
  if(this._readCallback)
    this._readCallback();
};

FileWatcherStream.prototype._handleWriteEnd = function()
{
  this._fileComplete = true;
  if(this._readCallback)
    this._readCallback();
};


FileWatcherStream.prototype._read = function(size) {
  /* For there to be no _readstream, it must have ended.
   */
  if( !this._readstream && this._fileComplete ) {
    // Indicate EOF
    this.push(null);
    return;
  }
  this._readFile();

  var chunk;
  do {
    /*
      This just returns BUFFERED data.
      A return of null means no buffered data, but there may still be more data.
      We don't try and determine if we're out of buffer or end-of-file here. _handleReadEnd handles reaching the end
        of the file, and removes the _readstream.
     */
    chunk = this._readstream.read(/*size*/);
    if( !chunk )
    {
      // Underlying stream doesn't have data yet, try again when it does
      // Set up a callback - called by various _handle* functions
      if(!this._readCallback)
      {
        this._readCallback = this._read.bind(this,size);
      }

      return;
    }
    // Had at least one successful read, so remove the callback
    this._readCallback = null;

    this._offset += chunk.length;
  } while(this.push(chunk))
};
