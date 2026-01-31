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
 * Get or create AutoClipper bin in project
 * @returns {ProjectItem} The AutoClipper bin
 */
function getOrCreateAutoClipperBin() {
    var project = getProject();
    if (!project) return null;

    var root = project.rootItem;
    var binName = 'AutoClipper';

    // Search for existing bin
    for (var i = 0; i < root.children.numItems; i++) {
        var item = root.children[i];
        if (item.name === binName && item.type === ProjectItemType.BIN) {
            return item;
        }
    }

    // Create new bin
    return root.createBin(binName);
}

/**
 * Reveal AutoClipper bin in project panel
 * @returns {string} 'ok' or 'error'
 */
function revealAutoClipperBin() {
    try {
        var bin = getOrCreateAutoClipperBin();
        if (bin) {
            bin.select();
            return 'ok';
        }
        return 'error: Could not find bin';
    } catch (e) {
        return 'error: ' + e.message;
    }
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
 * Find a sequence's ProjectItem by name in the project
 * @param {string} seqName - Name of the sequence to find
 * @returns {ProjectItem|null}
 */
function findSequenceProjectItem(seqName) {
    var project = getProject();
    if (!project) return null;

    // Search recursively in bins
    function searchBin(bin) {
        for (var i = 0; i < bin.children.numItems; i++) {
            var item = bin.children[i];
            if (item.type === ProjectItemType.BIN) {
                var found = searchBin(item);
                if (found) return found;
            } else if (item.name === seqName) {
                return item;
            }
        }
        return null;
    }

    return searchBin(project.rootItem);
}

/**
 * Create a new sequence from a clip segment
 * @param {string} clipDataJSON - JSON with clip info (startTime, endTime, suggestedTitle)
 * @param {string} presetId - Subtitle preset ID
 * @returns {string} 'ok' or 'error'
 */
function createSequenceFromClip(clipDataJSON, presetId) {
    $.writeln('[AutoClipper] === createSequenceFromClip START ===');

    var project = getProject();
    if (!project) {
        $.writeln('[AutoClipper] ERROR: No project open');
        return 'error: No project open';
    }
    $.writeln('[AutoClipper] Project: ' + project.name);

    try {
        var clipData = JSON.parse(clipDataJSON);
        $.writeln('[AutoClipper] Clip: ' + clipData.suggestedTitle);
        $.writeln('[AutoClipper] Time range: ' + clipData.startTime + 's - ' + clipData.endTime + 's');

        var seq = getActiveSequence();
        if (!seq) {
            $.writeln('[AutoClipper] ERROR: No active sequence');
            return 'error: No active sequence - open a sequence in the timeline first';
        }
        $.writeln('[AutoClipper] Source sequence: ' + seq.name);

        // Get AutoClipper bin first
        var autoClipperBin = getOrCreateAutoClipperBin();
        if (!autoClipperBin) {
            $.writeln('[AutoClipper] ERROR: Could not create AutoClipper bin');
            return 'error: Could not create AutoClipper bin';
        }
        $.writeln('[AutoClipper] AutoClipper bin ready: ' + autoClipperBin.name);

        // Find source clip in timeline
        var videoTracks = seq.videoTracks;
        if (videoTracks.numTracks === 0) {
            $.writeln('[AutoClipper] ERROR: No video tracks');
            return 'error: No video tracks in sequence';
        }

        var sourceClip = null;
        var sourceProjectItem = null;

        // Search all video tracks
        for (var t = 0; t < videoTracks.numTracks && !sourceClip; t++) {
            var track = videoTracks[t];
            $.writeln('[AutoClipper] Searching track ' + t + ' (' + track.clips.numItems + ' clips)');

            for (var i = 0; i < track.clips.numItems; i++) {
                var clip = track.clips[i];
                var clipStart = parseFloat(clip.start.seconds);
                var clipEnd = parseFloat(clip.end.seconds);

                // Check if clip contains our time range
                if (clipStart <= clipData.startTime && clipEnd >= clipData.endTime) {
                    sourceClip = clip;
                    sourceProjectItem = clip.projectItem;
                    $.writeln('[AutoClipper] Found clip: ' + clipStart + 's - ' + clipEnd + 's');
                    break;
                }
                // Check for overlap
                if (clipStart <= clipData.endTime && clipEnd >= clipData.startTime) {
                    sourceClip = clip;
                    sourceProjectItem = clip.projectItem;
                    $.writeln('[AutoClipper] Found overlapping clip: ' + clipStart + 's - ' + clipEnd + 's');
                    break;
                }
            }
        }

        if (!sourceClip || !sourceProjectItem) {
            $.writeln('[AutoClipper] ERROR: No clip found at time range');
            return 'error: No clip found at time ' + clipData.startTime + 's - ' + clipData.endTime + 's';
        }
        $.writeln('[AutoClipper] Source projectItem: ' + sourceProjectItem.name);

        // Create sequence name (sanitize for filesystem)
        var seqName = (clipData.suggestedTitle || 'AutoClip_' + Date.now())
            .replace(/[\\/:*?"<>|]/g, '_')
            .substring(0, 50);

        // Method 1: Try createNewSequenceFromClips with destination bin
        $.writeln('[AutoClipper] Creating sequence: ' + seqName);

        // Set in/out on source projectItem before creating sequence
        var ticksPerSecond = 254016000000;

        // Calculate in/out relative to clip position in timeline
        var clipStartInTimeline = parseFloat(sourceClip.start.seconds);
        var mediaInPoint = parseFloat(sourceClip.inPoint.seconds);

        // The offset from clip start to our desired start
        var offsetFromClipStart = clipData.startTime - clipStartInTimeline;
        var desiredInPoint = mediaInPoint + offsetFromClipStart;
        var desiredOutPoint = desiredInPoint + (clipData.endTime - clipData.startTime);

        $.writeln('[AutoClipper] Media in/out: ' + desiredInPoint + 's - ' + desiredOutPoint + 's');

        // Set in/out on the source project item
        sourceProjectItem.setInPoint(desiredInPoint, 4); // 4 = all media types
        sourceProjectItem.setOutPoint(desiredOutPoint, 4);

        // Create sequence from the clip with in/out points
        var newSeq = project.createNewSequenceFromClips(
            seqName,
            [sourceProjectItem],
            autoClipperBin  // Destination bin!
        );

        // Clear in/out points on source to not affect future uses
        sourceProjectItem.clearInPoint(4);
        sourceProjectItem.clearOutPoint(4);

        if (!newSeq) {
            $.writeln('[AutoClipper] createNewSequenceFromClips failed, trying fallback...');

            // Fallback: create empty sequence and insert clip
            newSeq = project.createNewSequence(seqName, seqName);
            if (!newSeq) {
                $.writeln('[AutoClipper] ERROR: Could not create sequence');
                return 'error: Could not create sequence';
            }

            // Insert clip
            var newVideoTrack = newSeq.videoTracks[0];
            if (newVideoTrack) {
                newVideoTrack.insertClip(sourceProjectItem, 0);
                $.writeln('[AutoClipper] Inserted clip into new sequence');
            }

            // Try to move to bin
            var seqProjectItem = findSequenceProjectItem(seqName);
            if (seqProjectItem) {
                seqProjectItem.moveBin(autoClipperBin);
                $.writeln('[AutoClipper] Moved sequence to bin');
            } else {
                $.writeln('[AutoClipper] WARNING: Could not find sequence to move to bin');
            }
        }

        $.writeln('[AutoClipper] === createSequenceFromClip SUCCESS ===');
        return 'ok: Created ' + seqName;

    } catch (e) {
        $.writeln('[AutoClipper] ERROR: ' + e.message);
        $.writeln('[AutoClipper] Line: ' + e.line);
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

// Try to enable QE DOM for playback control
try {
    if (typeof app !== 'undefined' && app.enableQE) {
        app.enableQE();
        $.writeln('AutoClipper: QE DOM enabled');
    }
} catch (qeErr) {
    $.writeln('AutoClipper: QE DOM not available - ' + qeErr.message);
}

// Simple test function to verify script is loaded
function testExtendScript() {
    return 'ExtendScript OK - ' + new Date().toISOString();
}
