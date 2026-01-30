/**
 * AutoClipper - ExtendScript Host
 * Premiere Pro automation functions
 */

// Polyfill for JSON if not available
if (typeof JSON === 'undefined') {
    JSON = {
        parse: function(str) { return eval('(' + str + ')'); },
        stringify: function(obj) {
            if (obj === null) return 'null';
            if (typeof obj === 'undefined') return undefined;
            if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
            if (typeof obj === 'string') return '"' + obj.replace(/"/g, '\\"') + '"';
            if (obj instanceof Array) {
                var arr = [];
                for (var i = 0; i < obj.length; i++) {
                    arr.push(JSON.stringify(obj[i]));
                }
                return '[' + arr.join(',') + ']';
            }
            if (typeof obj === 'object') {
                var pairs = [];
                for (var key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        pairs.push('"' + key + '":' + JSON.stringify(obj[key]));
                    }
                }
                return '{' + pairs.join(',') + '}';
            }
            return String(obj);
        }
    };
}

/**
 * Get current project
 * @returns {Project|null}
 */
function getProject() {
    if (app.project) {
        return app.project;
    }
    return null;
}

/**
 * Get active sequence
 * @returns {Sequence|null}
 */
function getActiveSequence() {
    var project = getProject();
    if (project && project.activeSequence) {
        return project.activeSequence;
    }
    return null;
}

/**
 * Get selected clips in project panel
 * @returns {string} JSON array of selected items
 */
function getSelectedClips() {
    var project = getProject();
    if (!project) return '[]';

    var selected = [];
    var viewIDs = project.getProjectPanelListViewIDs();

    // Note: This API is limited - may need alternative approach
    return JSON.stringify(selected);
}

/**
 * Get subtitle presets from project
 * @returns {string} JSON array of presets
 */
function getSubtitlePresets() {
    var presets = [
        { id: 'viral_yellow', name: 'Viral Yellow' },
        { id: 'minimal_white', name: 'Minimal White' },
        { id: 'bold_outline', name: 'Bold Outline' },
        { id: 'none', name: 'Sin subtitulos' }
    ];

    // TODO: Read actual Motion Graphics Templates from project
    // app.project.rootItem.children can contain .mogrt files

    return JSON.stringify(presets);
}

/**
 * Play clip range in source monitor
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 */
function playClipRange(startTime, endTime) {
    var seq = getActiveSequence();
    if (!seq) return 'error';

    try {
        // Convert seconds to ticks
        var ticksPerSecond = 254016000000; // Premiere's ticks per second
        var startTicks = startTime * ticksPerSecond;
        var endTicks = endTime * ticksPerSecond;

        // Set in/out points
        seq.setInPoint(startTicks.toString());
        seq.setOutPoint(endTicks.toString());

        // Move playhead to start
        seq.setPlayerPosition(startTicks.toString());

        // Try to auto-play using QE DOM if available
        try {
            if (typeof qe !== 'undefined') {
                qe.project.getActiveSequence().player.play(1.0);
            } else if (app.enableQE && app.enableQE()) {
                qe.project.getActiveSequence().player.play(1.0);
            }
        } catch (playErr) {
            // QE not available, user needs to press space
            $.writeln('Auto-play not available: ' + playErr.message);
        }

        return 'ok';
    } catch (e) {
        return 'error: ' + e.message;
    }
}

/**
 * Create a new sequence from a clip segment
 * @param {string} clipDataJSON - JSON with clip info (startTime, endTime, suggestedTitle)
 * @param {string} presetId - Subtitle preset ID
 * @returns {string} 'ok' or 'error'
 */
function createSequenceFromClip(clipDataJSON, presetId) {
    var project = getProject();
    if (!project) return 'error: No project open';

    try {
        var clipData = JSON.parse(clipDataJSON);
        var seq = getActiveSequence();

        if (!seq) return 'error: No active sequence';

        // Create a new sequence
        var seqName = clipData.suggestedTitle || 'AutoClip_' + Date.now();

        // Get sequence settings from current sequence
        var newSeq = project.createNewSequence(seqName, seqName);

        if (!newSeq) return 'error: Could not create sequence';

        // Find the source clip in the original sequence
        var sourceSeq = seq;
        var videoTracks = sourceSeq.videoTracks;

        if (videoTracks.numTracks === 0) return 'error: No video tracks';

        var videoTrack = videoTracks[0];
        var clips = videoTrack.clips;

        // Find clip that contains our time range
        var ticksPerSecond = 254016000000;
        var startTicks = clipData.startTime * ticksPerSecond;
        var endTicks = clipData.endTime * ticksPerSecond;

        var sourceClip = null;
        for (var i = 0; i < clips.numItems; i++) {
            var clip = clips[i];
            var clipStart = parseFloat(clip.start.seconds);
            var clipEnd = parseFloat(clip.end.seconds);

            if (clipStart <= clipData.startTime && clipEnd >= clipData.endTime) {
                sourceClip = clip;
                break;
            }
        }

        if (!sourceClip) {
            // Try to find by overlap
            for (var j = 0; j < clips.numItems; j++) {
                var c = clips[j];
                var cStart = parseFloat(c.start.seconds);
                var cEnd = parseFloat(c.end.seconds);

                if (cStart <= clipData.endTime && cEnd >= clipData.startTime) {
                    sourceClip = c;
                    break;
                }
            }
        }

        if (sourceClip && sourceClip.projectItem) {
            // Create subclip
            var subclipName = seqName + '_subclip';
            var inPoint = clipData.startTime;
            var outPoint = clipData.endTime;

            // Insert into new sequence
            var newVideoTrack = newSeq.videoTracks[0];

            // Import the project item and set in/out
            newSeq.setInPoint(0);
            newVideoTrack.insertClip(sourceClip.projectItem, 0);

            // Set in/out on the inserted clip
            var insertedClip = newVideoTrack.clips[0];
            if (insertedClip) {
                var mediaStart = parseFloat(insertedClip.inPoint.seconds);

                // Calculate offset from media start
                var clipOffset = clipData.startTime - parseFloat(sourceClip.start.seconds);
                var newInPoint = mediaStart + clipOffset;
                var newOutPoint = newInPoint + (clipData.endTime - clipData.startTime);

                insertedClip.inPoint = new Time();
                insertedClip.inPoint.seconds = newInPoint;
                insertedClip.outPoint = new Time();
                insertedClip.outPoint.seconds = newOutPoint;
            }

            // Apply subtitle preset if specified
            if (presetId && presetId !== 'none') {
                // TODO: Apply Motion Graphics Template with subtitles
                // This requires finding the .mogrt and applying it
            }

            return 'ok';
        }

        return 'error: Could not find source clip';

    } catch (e) {
        return 'error: ' + e.message;
    }
}

/**
 * Export sequences to Media Encoder
 * @param {string} sequenceNamesJSON - JSON array of sequence names
 * @param {string} outputPath - Output directory path
 * @param {string} presetPath - AME preset path
 * @returns {string} 'ok' or 'error'
 */
function exportSequences(sequenceNamesJSON, outputPath, presetPath) {
    var project = getProject();
    if (!project) return 'error: No project open';

    try {
        var sequenceNames = JSON.parse(sequenceNamesJSON);

        // Find sequences by name
        var sequences = [];
        for (var i = 0; i < project.sequences.numSequences; i++) {
            var seq = project.sequences[i];
            for (var j = 0; j < sequenceNames.length; j++) {
                if (seq.name === sequenceNames[j]) {
                    sequences.push(seq);
                    break;
                }
            }
        }

        if (sequences.length === 0) {
            return 'error: No sequences found';
        }

        // Queue each sequence for export
        for (var k = 0; k < sequences.length; k++) {
            var seq = sequences[k];
            var outputFile = outputPath + '/' + seq.name + '.mp4';

            // Add to AME queue
            app.encoder.encodeSequence(
                seq,
                outputFile,
                presetPath,
                app.encoder.ENCODE_WORKAREA,
                1 // Remove on completion
            );
        }

        // Start encoding
        app.encoder.startBatch();

        return 'ok';

    } catch (e) {
        return 'error: ' + e.message;
    }
}

/**
 * Create markers at viral moments
 * @param {string} momentsJSON - JSON array of {time, label}
 * @returns {string} 'ok' or 'error'
 */
function createMarkers(momentsJSON) {
    var seq = getActiveSequence();
    if (!seq) return 'error: No active sequence';

    try {
        var moments = JSON.parse(momentsJSON);
        var markers = seq.markers;

        for (var i = 0; i < moments.length; i++) {
            var moment = moments[i];
            var marker = markers.createMarker(moment.time);

            if (marker) {
                marker.name = moment.label || 'Viral Moment';
                marker.comments = moment.text || '';

                // Set marker color (green for viral)
                marker.setColorByIndex(3); // Green
            }
        }

        return 'ok';

    } catch (e) {
        return 'error: ' + e.message;
    }
}

/**
 * Get project info for debugging
 * @returns {string} JSON with project info
 */
function getProjectInfo() {
    var project = getProject();
    if (!project) return '{"error": "No project"}';

    var seq = getActiveSequence();

    var info = {
        name: project.name,
        path: project.path,
        hasActiveSequence: !!seq,
        sequenceName: seq ? seq.name : null,
        sequenceCount: project.sequences.numSequences
    };

    return JSON.stringify(info);
}

// Log initialization
$.writeln('AutoClipper ExtendScript loaded');
