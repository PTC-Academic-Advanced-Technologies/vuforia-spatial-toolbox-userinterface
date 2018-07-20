/**
 * @preserve
 *
 *                                      .,,,;;,'''..
 *                                  .'','...     ..',,,.
 *                                .,,,,,,',,',;;:;,.  .,l,
 *                               .,',.     ...     ,;,   :l.
 *                              ':;.    .'.:do;;.    .c   ol;'.
 *       ';;'                   ;.;    ', .dkl';,    .c   :; .'.',::,,'''.
 *      ',,;;;,.                ; .,'     .'''.    .'.   .d;''.''''.
 *     .oxddl;::,,.             ',  .'''.   .... .'.   ,:;..
 *      .'cOX0OOkdoc.            .,'.   .. .....     'lc.
 *     .:;,,::co0XOko'              ....''..'.'''''''.
 *     .dxk0KKdc:cdOXKl............. .. ..,c....
 *      .',lxOOxl:'':xkl,',......'....    ,'.
 *           .';:oo:...                        .
 *                .cd,      ╔═╗┌┬┐┬┌┬┐┌─┐┬─┐    .
 *                  .l;     ║╣  │││ │ │ │├┬┘    '
 *                    'l.   ╚═╝─┴┘┴ ┴ └─┘┴└─   '.
 *                     .o.                   ...
 *                      .''''','.;:''.........
 *                           .'  .l
 *                          .:.   l'
 *                         .:.    .l.
 *                        .x:      :k;,.
 *                        cxlc;    cdc,,;;.
 *                       'l :..   .c  ,
 *                       o.
 *                      .,
 *
 *      ╦═╗┌─┐┌─┐┬  ┬┌┬┐┬ ┬  ╔═╗┌┬┐┬┌┬┐┌─┐┬─┐  ╔═╗┬─┐┌─┐ ┬┌─┐┌─┐┌┬┐
 *      ╠╦╝├┤ ├─┤│  │ │ └┬┘  ║╣  │││ │ │ │├┬┘  ╠═╝├┬┘│ │ │├┤ │   │
 *      ╩╚═└─┘┴ ┴┴─┘┴ ┴  ┴   ╚═╝─┴┘┴ ┴ └─┘┴└─  ╩  ┴└─└─┘└┘└─┘└─┘ ┴
 *
 *
 * Created by Ben Reynolds on 7/17/18.
 */

createNameSpace("realityEditor.app.callbacks");

/**
 * @fileOverview realityEditor.app.callbacks.js
 * The central location where all functions triggered from within the native iOS code should reside.
 * These can just be simple routing functions that trigger the appropriate function in other files,
 * but this acts to organize all API calls in a single place.
 */

var targetDownloadStates = {};

var DownloadState = Object.freeze(
    {
        NOT_STARTED: 0,
        STARTED: 1,
        FAILED: 2,
        SUCCEEDED: 3
    });


/**
 * Callback when a UDP message discovers a new object
 * @param {{id: string, ip: string, vn: number, tcs: string}} beat
 */
realityEditor.app.callbacks.addHeartbeatObject = function(beat) {
    // realityEditor.network.addHeartbeatObject(beat);
    // console.log(beat);
    
    var objectName = beat.id.slice(0,-12); // get objectName from objectId
    
    var needsXML = true;
    var needsDAT = true;
    
    if (typeof targetDownloadStates[objectName] !== 'undefined') {
        if (targetDownloadStates[objectName].XML === DownloadState.STARTED ||
            targetDownloadStates[objectName].XML === DownloadState.SUCCEEDED) {
            needsXML = false;
        }
        if (targetDownloadStates[objectName].DAT === DownloadState.STARTED ||
            targetDownloadStates[objectName].DAT === DownloadState.SUCCEEDED) {
            needsDAT = false;
        }

    } else {
        targetDownloadStates[objectName] = {
            XML: DownloadState.NOT_STARTED,
            DAT: DownloadState.NOT_STARTED,
            MARKER_ADDED: DownloadState.NOT_STARTED
        };
    }
    
    if (!needsXML && !needsDAT) {
        return;
    }
    
    console.log(beat);
    
    if (needsXML) {
        var xmlAddress = 'http://' + beat.ip + ':' + httpPort + '/obj/' + objectName + '/target/target.xml';
        realityEditor.app.downloadFile(xmlAddress, 'realityEditor.app.callbacks.onTargetFileDownloaded');
        targetDownloadStates[objectName].XML = DownloadState.STARTED;
    }
    
    if (needsDAT) {
        var datAddress = 'http://' + beat.ip + ':' + httpPort + '/obj/' + objectName + '/target/target.dat';
        realityEditor.app.downloadFile(datAddress, 'realityEditor.app.callbacks.onTargetFileDownloaded');
        targetDownloadStates[objectName].DAT = DownloadState.STARTED;
    }

};

realityEditor.app.callbacks.onTargetFileDownloaded = function(success, fileName) {
    
    var objectName = fileName.split('/')[4];
    var isXML = fileName.split('/')[fileName.split('/').length-1].indexOf('xml') > -1;
    
    if (success) {
        console.log('successfully downloaded file: ' + fileName);
        targetDownloadStates[objectName][isXML ? 'XML' : 'DAT'] = DownloadState.SUCCEEDED;
    } else {
        console.log('failed to download file: ' + fileName);
        targetDownloadStates[objectName][isXML ? 'XML' : 'DAT'] = DownloadState.FAILED;
    }
    
    var hasXML = targetDownloadStates[objectName].XML === DownloadState.SUCCEEDED;
    var hasDAT = targetDownloadStates[objectName].DAT === DownloadState.SUCCEEDED;
    var markerNotAdded = (targetDownloadStates[objectName].MARKER_ADDED === DownloadState.NOT_STARTED ||
                          targetDownloadStates[objectName].MARKER_ADDED === DownloadState.FAILED);
    
    var xmlFileName = isXML ? fileName : fileName.slice(0, -3) + 'xml';
    if (hasXML && hasDAT && markerNotAdded) {
        realityEditor.app.addNewMarker(xmlFileName, 'realityEditor.app.callbacks.onMarkerAdded');
        targetDownloadStates[objectName].MARKER_ADDED = DownloadState.STARTED;
    }
};

realityEditor.app.callbacks.onMarkerAdded = function(success, fileName) {
    console.log('marker added: ' + fileName + ', success? ' + success);
    var objectName = fileName.split('/')[4];

    if (success) {
        console.log('successfully added marker: ' + fileName);
        targetDownloadStates[objectName].MARKER_ADDED = DownloadState.SUCCEEDED;
    } else {
        console.log('failed to add marker: ' + fileName);
        targetDownloadStates[objectName].MARKER_ADDED = DownloadState.FAILED;
    }
};
