(function(exports) {

    /* eslint no-inner-declarations: "off" */
    // makes sure this only gets loaded once per iframe
    if (typeof exports.Envelope !== 'undefined') {
        return;
    }

    /**
     * @constructor
     */
    function FrameData(id, type) {
        this.id = id;
        this.type = type;
    }

    /**
     * @constructor
     * Defines an interface that declares this frame to be an "envelope" frame that can contain other frames to
     * form some form of a relationship between them all. Envelopes have an "open" state, where they take up the
     * fullscreen 2D UI, and a "closed" state, where they are minimized into a small 3D icon in space. Their contained
     * frames are only visible when the envelope is open.
     * 
     * @param {Array.<string>} compatibleFrameTypes
     * @param {HTMLElement} bodyWhenOpen - a containing div that will be rendered when open (fullscreen 2D)
     * @param {HTMLElement} bodyWhenClosed - a containing div that will be rendered when closed (small 3D icon)
     * @param {boolean|undefined} isStackable - defaults to false
     * @param {boolean|undefined} areFramesOrdered - defaults to false
     */
    function Envelope(realityInterface, compatibleFrameTypes, bodyWhenOpen, bodyWhenClosed, isStackable, areFramesOrdered) {
        if (typeof compatibleFrameTypes === 'undefined' || compatibleFrameTypes.length === 0) {
            console.warn('You must specify at least one compatible frame type for this envelope');
        }
        if (typeof isStackable === 'undefined') { isStackable = false; }
        if (typeof areFramesOrdered === 'undefined') { areFramesOrdered = false; }

        /**
         * A pointer to the envelope frame's RealityInterface object, so that this can interact with the other JavaScript APIs
         */
        this.realityInterface = realityInterface;
        /**
         * The names of which frames can be added to this envelope
         * @type {Array.<string>}
         */
        this.compatibleFrameTypes = compatibleFrameTypes;
        /**
         * If other envelopes can be open at the same time or not
         * @type {boolean}
         */
        this.isStackable = isStackable;
        /**
         * Should this keep track of the ordering of its contained frames, or are they an unordered set
         * @type {boolean}
         */
        this.areFramesOrdered = areFramesOrdered;
        /**
         * A map of all the frameIds -> frame data for each frame added to the envelope
         * @type {Object.<string, Object>}
         */
        this.containedFrames = {};
        /**
         * A list of frameIds. The order they appear here determines their ordering / indices.
         * Only used if areFramesOrdered===true.
         * @type {Array}
         */
        this.frameIdOrdering = [];
        /**
         * Whether the envelope is opened in a fullscreen/maximized way, or minimized as a small 3D icon in space
         * @type {boolean}
         */
        this.isOpen = false;
        /**
         * Callbacks for various events from contained frames or the reality editor
         * @type {{onFrameAdded: null, onFrameDeleted: null, onMessageFromFrame: null, onOpen: null, onClose: null}}
         */
        this.callbacks = {
            /**
             * Triggered when the envelope is open and a compatible frame is created
             */
            onFrameAdded: [],
            /**
             * Triggered when a contained frame is deleted. Automatically updates ordering, etc, but you may need to update UI
             */
            onFrameDeleted: [],
            /**
             * Triggered when a contained frame sends a message to the envelope (e.g. "stepCompleted")
             */
            onMessageFromFrame: [],
            /**
             * Triggered when the user taps on the envelope or otherwise opens it. May need to update UI for fullscreen
             */
            onOpen: [],
            /**
             * Triggered when the user closes/minimizes the envelope, or another non-stackable envelope kicks this one out of fullscreen
             */
            onClose: []
        };
        
        // UI
        this.bodyWhenOpen = bodyWhenOpen;
        this.bodyWhenClosed = bodyWhenClosed;
        
        if (this.isOpen) {
            this.bodyWhenClosed.style.display = 'none';
        } else {
            this.bodyWhenOpen.style.display = 'none';
        }

        /**
         * Triggers all callbacks functions when the iframe receives an 'envelopeMessage' POST message from the parent window.
         * It is the responsibility of each callback function to filter out messages that aren't directed to it.
         */
        window.addEventListener('message', function (msg) {
            let msgContent = JSON.parse(msg.data);
            if (typeof msgContent.envelopeMessage === 'undefined') {
                return;
            }
            for (let callbackKey in this.callbacks) {
                if (this.callbacks[callbackKey]) { // only trigger for callbacks that have been set
                    this.callbacks[callbackKey].forEach(function(addedCallback) {
                        addedCallback(msgContent.envelopeMessage)
                    });
                }
            }
            
            if (typeof msgContent.envelopeMessage.sendMessageToContents !== 'undefined') {
                // sendMessageToContents
                this.sendMessageToAllFrames(msgContent.envelopeMessage.sendMessageToContents);
            }
            
        }.bind(this));
        
        // initialize by adding some default event listeners that adjust the UI based on some events
        
        // this keeps the list of contained frames and the ordering up-to-date
        // add your own callback to adjust the UI based on frames being added or removed
        this.onFrameAdded(function(frameAddedMessage) {
            this.containedFrames[frameAddedMessage.frameId] = new FrameData(frameAddedMessage.frameId, frameAddedMessage.frameType);
            if (this.areFramesOrdered) {
                this.frameIdOrdering.push(frameAddedMessage.frameId); // add to ordering
            }
            this.orderingUpdated();
            this.containedFramesUpdated();
            this.savePersistentData();
        }.bind(this));
        
        this.onFrameDeleted(function(frameDeletedMessage) {
            delete this.containedFrames[frameDeletedMessage.frameId];
            if (this.areFramesOrdered) {
                let index = this.frameIdOrdering.indexOf(frameDeletedMessage.frameId);
                if (index > -1) {
                    this.frameIdOrdering.splice(index, 1); // remove from ordering
                }
            }
            this.orderingUpdated();
            this.containedFramesUpdated();
            this.savePersistentData();
        }.bind(this));

        // this updates the UI automatically when the frame is opened or closed to switch between its two container divs
        this.onOpen(function(_openMessage) {
            this.bodyWhenClosed.style.display = 'none'; // TODO: move to a class that gets added?
            this.bodyWhenOpen.style.display = 'inline';
        }.bind(this));

        this.onClose(function(_closeMessage) {
            this.bodyWhenClosed.style.display = 'inline'; // TODO: move to a class that gets added?
            this.bodyWhenOpen.style.display = 'none';
        }.bind(this));
        
        this.realityInterface.sendEnvelopeMessage({
            isEnvelope: true,
            compatibleFrameTypes: this.compatibleFrameTypes
        });
        
        // automatically ensure that there is a storeData node called 'storage' on the envelope frame
        let nodeParams = {
            name: 'storage',
            x: 0,
            y: 0,
            groundplane: false,
            type: 'storeData',
            noDuplicate: true
        };
        this.realityInterface.sendCreateNode(nodeParams.name, nodeParams.x, nodeParams.y, nodeParams.groundplane, nodeParams.type, nodeParams.noDuplicate);

        // read from storage to restore any relationships with contained frames
        realityInterface.addReadPublicDataListener('storage', 'envelopeContents', function (savedContents) {
            console.log('saved envelope contents', savedContents);
            if (typeof savedContents.containedFrames !== 'undefined') {
                this.containedFrames = savedContents.containedFrames;
                console.log('loaded containedFrames');
                this.containedFramesUpdated();
            }
            if (typeof savedContents.frameIdOrdering !== 'undefined') {
                this.frameIdOrdering = savedContents.frameIdOrdering;
                this.orderingUpdated();
                console.log('loaded frameIdOrdering');
            }
        }.bind(this));
    }
    
    Envelope.prototype.containedFramesUpdated = function() {
        // send up to editor so editor module has a map of envelopes->containedFrames
        this.realityInterface.sendEnvelopeMessage({
            containedFrameIds: Object.keys(this.containedFrames)
        });
    };
    
    Envelope.prototype.orderingUpdated = function() {
        if (!this.areFramesOrdered) { return; }
        // send a message to each frame with their order
        this.frameIdOrdering.forEach(function(frameId, index) {
            this.sendMessageToFrameWithId(frameId, {
                onOrderUpdated: {
                    index: index,
                    total: this.frameIdOrdering.length
                }
            })
        }.bind(this));
        
    };

    Envelope.prototype.savePersistentData = function() {
        let envelopeContents = {
            containedFrames: this.containedFrames
        };
        if (this.areFramesOrdered) {
            envelopeContents.frameIdOrdering = this.frameIdOrdering;
        }
        console.log('savePersistentData', envelopeContents);
        realityInterface.writePublicData('storage', 'envelopeContents',  envelopeContents);
    };

    /**
     * Method to manually trigger callbacks via the envelope object, rather than responding to POST message events.
     * They usually get triggered via the window.addEventListener('message', ...) callback handler.
     * @param {string} callbackName
     * @param {Object} msgContent
     */
    Envelope.prototype.triggerCallbacks = function(callbackName, msgContent) {
        if (this.callbacks[callbackName]) { // only trigger for callbacks that have been set
            this.callbacks[callbackName].forEach(function(addedCallback) {
                var msgObject = {};
                msgObject[callbackName] = msgContent;
                addedCallback(msgObject);
            });
        }
    };
    
    //
    // Methods to adapt the UI to the open/closed state
    //
    
    /**
     * Triggers the envelope to open if it's closed, which means it becomes sticky fullscreen and triggers onOpen events
     */
    Envelope.prototype.open = function() {
        if (this.isOpen) { return; }
        
        this.isOpen = true;
        this.realityInterface.setStickyFullScreenOn(); // I'm assuming envelopes want 'sticky' fullscreen, not regular
        if (!this.isStackable) {
            this.realityInterface.setExclusiveFullScreenOn(function() {
                this.close(); // trigger all the side-effects related to the envelope closing
            }.bind(this));
        }

        this.triggerCallbacks('onOpen', {});
        
        this.realityInterface.sendEnvelopeMessage({
            open: true
        });
    };

    /**
     * Triggers the envelope to close if it's open, which means it turns off fullscreen and triggers onClosed events
     */
    Envelope.prototype.close = function() {
        if (!this.isOpen) { return; }
        
        this.isOpen = false;
        this.realityInterface.setFullScreenOff();

        this.triggerCallbacks('onClose', {});

        this.realityInterface.sendEnvelopeMessage({
            close: true
        });
    };
    
    //
    // Methods to subscribe to events from contained frames or from the reality editor 
    //
    
    Envelope.prototype.onFrameAdded = function(callback) {
        this.addCallback('onFrameAdded', callback); // TODO: call onOrderUpdated here? or handle it somewhere else?
    };
    
    Envelope.prototype.onFrameDeleted = function(callback) {
        this.addCallback('onFrameDeleted', callback);
    };
    
    Envelope.prototype.onMessageFromFrame = function(callback) {
        this.addCallback('onMessageFromFrame', callback);
    };
    
    Envelope.prototype.onOpen = function(callback) {
        this.addCallback('onOpen', callback);
    };
    
    Envelope.prototype.onClose = function(callback) {
        this.addCallback('onClose', callback);
    };
    
    //
    // Methods to trigger events on contained frames or on the envelope itself
    //
    
    /**
     * Sends a JSON message to a particular contained frame, if there is one matching that ID
     * @param {string} id - the uuid of the frame
     * @param {Object} message
     */
    Envelope.prototype.sendMessageToFrameWithId = function(id, message) {
        this.realityInterface.sendMessageToFrame(id, {
            envelopeMessage: message // TODO: is this the right format?
        });
    };

    /**
     * Sends a JSON message to all contained frames
     * @param {Object} message
     */
    Envelope.prototype.sendMessageToAllFrames = function(message) {
        this.forEachFrame(function(frameId, _frameData) {
            this.sendMessageToFrameWithId(frameId, message);
        }.bind(this));
    };

    /**
     * Sends a JSON message to the contained frame in a certain index of the ordering
     * @param {number} index
     * @param {Object} message
     * @todo: implement
     */
    Envelope.prototype.sendMessageToFrameAtIndex = function(index, message) {
        if (!this.areFramesOrdered) {
            console.warn('You cannot send a message by index if the frames are unordered');
            return;
        }
        this.sendMessageToFrameWithId(this.getFrameIdAtIndex(index), message);
    };
    
    /**
     * Moves the frame with the specified ID to the new index
     * @param {string} frameId
     * @param {number} newIndex
     */
    Envelope.prototype.reorderFrames = function(frameId, newIndex) {
        if (!this.areFramesOrdered) {
            console.warn('You cannot reorder frames if the frames are unordered');
            return;
        }
        let currentIndex = this.frameIdOrdering.indexOf(frameId);
        if (currentIndex > -1) {
            this.frameIdOrdering.move(currentIndex, newIndex);
            
            // notify all frames of their new indices
            this.frameIdOrdering.forEach(function(id, index) {
                this.sendMessageToFrameWithId(id, {
                    onOrderUpdated: {
                        index: index,
                        total: this.frameIdOrdering.length
                    }
                });
            }.bind(this));
        }
    };
    
    //
    // Helper functions
    //
    
    /**
     * Helper function to correctly add a callback function
     * @param {string} callbackName - should match one of the keys in this.callbacks
     * @param {function} callbackFunction
     */
    Envelope.prototype.addCallback = function(callbackName, callbackFunction) {
        if (typeof this.callbacks[callbackName] === 'undefined') {
            console.warn('Creating a new envelope callback that wasn\'t defined in the constructor');
            this.callbacks[callbackName] = [];
        }

        this.callbacks[callbackName].push(function(envelopeMessage) {
            if (typeof envelopeMessage[callbackName] === 'undefined') { return; }
            callbackFunction(envelopeMessage[callbackName]);
        });
    };

    /**
     * Gets the frame id that corresponds to a certain index in the ordering
     * @param index
     * @todo: make private?
     * @todo: implement
     */
    Envelope.prototype.getFrameIdAtIndex = function(index) {
        if (!this.areFramesOrdered) {
            console.warn('You cannot send a message by index if the frames are unordered');
            return;
        }
        return this.frameIdOrdering[index];
    };

    /**
     * Helper function to iterate over all contained frames
     * @param {function} callback
     */
    Envelope.prototype.forEachFrame = function(callback) {
        for (let frameId in this.containedFrames) {
            callback(frameId, this.containedFrames[frameId]);
        }
    };

    /**
     * Adds a helper function to Arrays to move an element to a new index
     * @author https://stackoverflow.com/a/2440723/1190267
     * @param from
     * @param to
     */
    Array.prototype.move = function (from, to) {
        this.splice(to, 0, this.splice(from, 1)[0]);
    };
    
    exports.Envelope = Envelope;

})(window);
