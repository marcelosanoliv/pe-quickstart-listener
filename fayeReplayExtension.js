
exports.FayeReplayExtension = {

  REPLAY_FROM_KEY : "replay",
  _extensionEnabled : true,
  _channel: '',
  _replay: '-1',

  setChannel: function(channel) {
    this._channel = channel;
  },

  setReplay: function (replay) {
    this._replay = parseInt(replay, 10);
  },

  incoming: function(message, callback) {
/*
    if (message.channel === '/meta/handshake') {
      if (message.ext && message.ext[REPLAY_FROM_KEY] == true) {
        _extensionEnabled = true;
      }
    }
*/
    // Call the server back now we're done
    callback(message);
  },

  outgoing: function(message, callback) {

    // Add ext field if it's not present
    if (!message.ext) message.ext = {};


    if (message.channel === '/meta/subscribe') {
      if (this._extensionEnabled) {
        if (!message.ext) { message.ext = {}; }

        var replayFromMap = {};
        replayFromMap[this._channel] = this._replay;
        console.log('Configuring replay for channel: ' + this._channel + ' to: ' + this._replay);

        // add "ext : { "replay" : { CHANNEL : REPLAY_VALUE }}" to subscribe message
        message.ext[this.REPLAY_FROM_KEY] = replayFromMap;
      }
    }

    // Carry on and send the message to the server
    callback(message);
  }

};