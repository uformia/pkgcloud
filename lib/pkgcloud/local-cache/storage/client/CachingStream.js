/**
 * Created by Wizarth on 6/08/2016.
 */

var stream = require('stream');
var util = require('util');
var os = require('os');
var path = require('path');
var fs = require('fs');
var _ = require('underscore');

var FileWatcherStream = require('./FileWatcherStream').FileWatcherStream;

/**
 * A CachingStream manages all the upload/download stream connection logic
 * It can be in several states:
 * * Pending Write
 *    Resource has been "touched", there may be requests for Read but there has been no Write stream provided yet.
 *    Functionally this is no different to the Writing state, as we create our temp file immediately.
 * * Writing
 *    Write stream has been attached. Contents are being written to disk. All Readers follow the disk writing, even
 *    those that have caught up. This prevents any Reader blocking the Writer.
 *      Initially was going to have Readers that catch up to the disk cache attach to the Write stream, but this assumes
 *      Readers are faster than the Write stream.
 * * Completing
 *    Write stream has finished. Inform disk readers that the file is done (stop waiting for more).
 *    Wait for disk readers to be done.
 *    When a disk reader is done,
 *      Check if there are new disk readers. If so, wait for them to be done.
 *    If there are no disk readers left, Completed
 * * Completed
 *      Remove temp file
 *      Mark self as done.
 *
 * @param {object} [options={}]
 * @param {string} [options.tmpdir=os.tmpdir()]
 * @param {?object} options.success - Value to emit with a success signal when the stream Write ends
 * @constructor
 */
var CachingStream = exports.CachingStream = function(options) {
  stream.PassThrough.call(this, options);

  options = options || {};

  var tmpdir = options.tmpdir || os.tmpdir();

  /* Cribbed from node-temp generateName */
  var now = new Date();
  var name = [now.getYear(), now.getMonth(), now.getDate(),
    '-',
    process.pid,
    '-',
    (Math.random() * 0x100000000 + 1).toString(36)].join('');
  /**
   * @type string
   * @private
   */
  this._path = path.join(tmpdir, name );

  /**
   * @type {WriteStream}
   * @private
   */
  this._writestream = fs.createWriteStream(this._path);

  /* Automatically write any data given to us to the backing disk.
     Use the "actually acts as a pipe" implementation of pipe, not our intercept/redirect version of pipe.
  */
  //stream.PassThrough.prototype.pipe.call(this, this._writestream);

  /**
   *
   * @type {FileWatcherStream[]}
   * @private
   */
  this._readers = [];

  /**
   * Value to emit with a success signal when the stream Write ends
   * @type {?object}
   * @private
   */
  this._success = options.success;
};

util.inherits(CachingStream, stream.PassThrough);

/**
 * Rather than allowing readers to attach directly to this stream, we create them a unique file monitoring stream, and
 * attach them to that.
 * @param {WriteStream} dest
 * @param {?object} pipeOpts
 */
CachingStream.prototype.pipe = function( dest, pipeOpts ) {
  this.getReadStream().pipe(dest, pipeOpts);
};

/**
 * Get a FileWatcher suitable for outside consumers to use.
 * @return {ReadStream}
 */
CachingStream.prototype.getReadStream = function() {
  var watcher = new FileWatcherStream(this._path);
  this._readers.push(watcher);
  // Connect the data and end events to the watcher
  stream.PassThrough.prototype.pipe.call(this, watcher);
  return watcher;
};

/**
 * WriteStream end override
 * @override
 * @param chunk
 * @param encoding
 * @param callback
 */
CachingStream.prototype.end = function(chunk, encoding, callback)
{
  var self = this;
  stream.PassThrough.prototype.end.call(this, chunk, encoding, function(err){
    if( err ) {
      callback && callback(err);
    } else {
      self._writestream.end(chunk, encoding, function(err) {
        if(err)
        {
          callback && callback(err);
        } else {
          // TODO: End the readers
          _.each(self._readers, function(reader) {
            reader.emit('end');
          });

          callback && callback();
        }
      });
    }
  });
};

CachingStream.prototype._write = function(chunk, encoding, callback) {
  var self = this;
  stream.PassThrough.prototype._write.call(this,chunk,encoding,function(err) {
    if (err) {
      callback && callback(err);
    } else {
      _.each(self._readers, function(reader) {
        reader.emit('data');
      });

      self._writestream.write(chunk, encoding, callback);
    }
  });

};
