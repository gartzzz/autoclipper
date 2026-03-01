/**
 * AutoClipper - ExtendScript Host
 * Premiere Pro automation functions
 */

// CRITICAL: Wrap everything in try-catch to prevent engine corruption
try {
    // LOAD MARKER - If this runs, the file is being parsed
    var _autoClipperLoaded = true;
    $.writeln('[AutoClipper JSX] Script file is being parsed...');
} catch (initErr) {
    $.writeln('[AutoClipper JSX] INIT ERROR: ' + initErr.message);
}

// Polyfill for JSON if not available
if (typeof JSON === 'undefined') {
    JSON = {};
    JSON.parse = function(str) {
        try {
            return eval('(' + str + ')');
        } catch (e) {
            return null;
        }
    };
    JSON.stringify = function(obj) {
        if (obj === null) return 'null';
        if (typeof obj === 'undefined') return 'undefined';
        if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
        if (typeof obj === 'string') return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
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
    };
}

/**
 * Simple diagnostic function - call this first to verify ExtendScript works
 */
function acDiagnose() {
    try {
        var result = {
            extendScriptVersion: $.version,
            appName: typeof app !== 'undefined' ? app.name : 'N/A',
            appVersion: typeof app !== 'undefined' ? app.version : 'N/A',
            hasProject: typeof app !== 'undefined' && app.project ? true : false,
            autoClipperLoaded: typeof _autoClipperLoaded !== 'undefined' ? _autoClipperLoaded : false
        };
        return JSON.stringify(result);
    } catch (e) {
        return '{"error":"' + e.message + '"}';
    }
}

/**
 * Get current project
 */
function getProject() {
    try {
        if (typeof app !== 'undefined' && app.project) {
            return app.project;
        }
    } catch (e) {
        $.writeln('[AutoClipper] getProject error: ' + e.message);
    }
    return null;
}

/**
 * Get active sequence
 */
function getActiveSequence() {
    try {
        var project = getProject();
        if (project && project.activeSequence) {
            return project.activeSequence;
        }
    } catch (e) {
        $.writeln('[AutoClipper] getActiveSequence error: ' + e.message);
    }
    return null;
}

/**
 * Get source project item from Project Panel selection
 * User must select the video in Project Panel before creating clips
 */
function getSourceProjectItem() {
    var project = getProject();
    if (!project) return null;

    try {
        var viewIds = app.getProjectViewIDs();
        $.writeln('[AutoClipper] Project view IDs: ' + viewIds.length);

        if (viewIds && viewIds.length > 0) {
            var selectedItems = app.getProjectViewSelection(viewIds[0]);
            $.writeln('[AutoClipper] Selected items: ' + (selectedItems ? selectedItems.length : 0));

            if (selectedItems && selectedItems.length > 0) {
                var item = selectedItems[0];
                $.writeln('[AutoClipper] Selected item: ' + item.name + ' (type: ' + item.type + ')');

                // Check if it's a media clip (not a bin or sequence)
                // ProjectItemType.CLIP = 1, BIN = 2, FILE = 4
                if (item.type !== 2) { // Not a BIN
                    return item;
                } else {
                    $.writeln('[AutoClipper] Selected item is a bin, not a clip');
                }
            }
        }
    } catch (e) {
        $.writeln('[AutoClipper] getSourceProjectItem error: ' + e.message);
    }

    return null;
}

/**
 * Get or create AutoClipper bin in project
 */
function getOrCreateAutoClipperBin() {
    var project = getProject();
    if (!project) return null;

    try {
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
    } catch (e) {
        $.writeln('[AutoClipper] getOrCreateAutoClipperBin error: ' + e.message);
        return null;
    }
}

/**
 * Reveal AutoClipper bin in project panel
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
 */
function getSelectedClips() {
    var project = getProject();
    if (!project) return '[]';

    var selected = [];
    return JSON.stringify(selected);
}

/**
 * Get subtitle presets from project
 */
function getSubtitlePresets() {
    var presets = [
        { id: 'viral_yellow', name: 'Viral Yellow' },
        { id: 'minimal_white', name: 'Minimal White' },
        { id: 'bold_outline', name: 'Bold Outline' },
        { id: 'none', name: 'Sin subtitulos' }
    ];
    return JSON.stringify(presets);
}

/**
 * Play clip range in source monitor
 */
function playClipRange(startTime, endTime) {
    var seq = getActiveSequence();
    if (!seq) return 'error: No active sequence';

    try {
        var ticksPerSecond = 254016000000;
        var startTicks = startTime * ticksPerSecond;

        // SAFE: Only move the playhead, never touch in/out points or QE DOM
        seq.setPlayerPosition(startTicks.toString());

        return 'ok';
    } catch (e) {
        return 'error: ' + e.message;
    }
}

/**
 * Find a sequence's ProjectItem by name
 */
function findSequenceProjectItem(seqName) {
    var project = getProject();
    if (!project) return null;

    function searchBin(bin) {
        try {
            for (var i = 0; i < bin.children.numItems; i++) {
                var item = bin.children[i];
                if (item.type === ProjectItemType.BIN) {
                    var found = searchBin(item);
                    if (found) return found;
                } else if (item.name === seqName) {
                    return item;
                }
            }
        } catch (e) {
            $.writeln('[AutoClipper] searchBin error: ' + e.message);
        }
        return null;
    }

    return searchBin(project.rootItem);
}

/**
 * Create a new sequence from a clip segment
 * NEW: Uses selected item in Project Panel instead of active sequence
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
        var clipData;
        try {
            clipData = JSON.parse(clipDataJSON);
        } catch (parseErr) {
            $.writeln('[AutoClipper] ERROR: Invalid JSON: ' + parseErr.message);
            return 'error: Invalid clip data JSON';
        }

        $.writeln('[AutoClipper] Clip: ' + clipData.suggestedTitle);
        $.writeln('[AutoClipper] Time range: ' + clipData.startTime + 's - ' + clipData.endTime + 's');

        // Get source from Project Panel selection (no sequence needed!)
        var sourceProjectItem = getSourceProjectItem();
        if (!sourceProjectItem) {
            $.writeln('[AutoClipper] ERROR: No video selected in Project Panel');
            return 'error: Select the source video in the Project Panel first';
        }
        $.writeln('[AutoClipper] Source: ' + sourceProjectItem.name);

        // Create AutoClipper bin
        var autoClipperBin = getOrCreateAutoClipperBin();
        if (!autoClipperBin) {
            $.writeln('[AutoClipper] ERROR: Could not create AutoClipper bin');
            return 'error: Could not create AutoClipper bin';
        }
        $.writeln('[AutoClipper] AutoClipper bin ready: ' + autoClipperBin.name);

        // Create sequence name (sanitize for filesystem)
        var seqName = (clipData.suggestedTitle || 'AutoClip_' + Date.now());
        seqName = seqName.replace(/\\/g, '_');
        seqName = seqName.replace(/\//g, '_');
        seqName = seqName.replace(/:/g, '_');
        seqName = seqName.replace(/\*/g, '_');
        seqName = seqName.replace(/\?/g, '_');
        seqName = seqName.replace(/"/g, '_');
        seqName = seqName.replace(/</g, '_');
        seqName = seqName.replace(/>/g, '_');
        seqName = seqName.replace(/\|/g, '_');
        seqName = seqName.substring(0, 50);

        $.writeln('[AutoClipper] Creating sequence: ' + seqName);

        // Set in/out points directly on the source project item
        // Times from transcript are absolute (from start of video)
        var desiredInPoint = clipData.startTime;
        var desiredOutPoint = clipData.endTime;

        $.writeln('[AutoClipper] In/Out points: ' + desiredInPoint + 's - ' + desiredOutPoint + 's');

        // CRITICAL: Use try-finally to ALWAYS clear in/out points
        sourceProjectItem.setInPoint(desiredInPoint, 4); // 4 = all media types
        sourceProjectItem.setOutPoint(desiredOutPoint, 4);

        var newSeq = null;
        try {
            newSeq = project.createNewSequenceFromClips(seqName, [sourceProjectItem], autoClipperBin);
            $.writeln('[AutoClipper] createNewSequenceFromClips result: ' + (newSeq ? 'success' : 'null'));
        } catch (seqErr) {
            $.writeln('[AutoClipper] createNewSequenceFromClips error: ' + seqErr.message);
        } finally {
            try {
                sourceProjectItem.clearInPoint(4);
                sourceProjectItem.clearOutPoint(4);
            } catch (clearErr) {
                $.writeln('[AutoClipper] clearInPoint/OutPoint error: ' + clearErr.message);
            }
        }

        if (!newSeq) {
            $.writeln('[AutoClipper] Primary method failed, trying fallback...');

            // Fallback: create empty sequence and insert clip
            try {
                newSeq = project.createNewSequence(seqName, seqName);
            } catch (fallbackErr) {
                $.writeln('[AutoClipper] createNewSequence error: ' + fallbackErr.message);
                return 'error: Could not create sequence: ' + fallbackErr.message;
            }

            if (newSeq && newSeq.videoTracks && newSeq.videoTracks[0]) {
                sourceProjectItem.setInPoint(desiredInPoint, 4);
                sourceProjectItem.setOutPoint(desiredOutPoint, 4);

                try {
                    // Insert into BOTH video and audio tracks
                    newSeq.videoTracks[0].insertClip(sourceProjectItem, 0);
                    $.writeln('[AutoClipper] Inserted clip into video track');

                    if (newSeq.audioTracks && newSeq.audioTracks[0]) {
                        newSeq.audioTracks[0].insertClip(sourceProjectItem, 0);
                        $.writeln('[AutoClipper] Inserted clip into audio track');
                    }
                } catch (insertErr) {
                    $.writeln('[AutoClipper] Insert error: ' + insertErr.message);
                } finally {
                    try {
                        sourceProjectItem.clearInPoint(4);
                        sourceProjectItem.clearOutPoint(4);
                    } catch (clearErr) {
                        $.writeln('[AutoClipper] Clear error: ' + clearErr.message);
                    }
                }
            }

            // Move sequence to AutoClipper bin
            var seqProjectItem = findSequenceProjectItem(seqName);
            if (seqProjectItem) {
                try {
                    seqProjectItem.moveBin(autoClipperBin);
                    $.writeln('[AutoClipper] Moved sequence to bin');
                } catch (moveErr) {
                    $.writeln('[AutoClipper] Move error: ' + moveErr.message);
                }
            }
        }

        $.writeln('[AutoClipper] === createSequenceFromClip SUCCESS ===');
        return 'ok: Created ' + seqName;

    } catch (e) {
        $.writeln('[AutoClipper] FATAL ERROR: ' + e.message);
        $.writeln('[AutoClipper] Line: ' + e.line);
        return 'error: ' + e.message;
    }
}

/**
 * Format seconds to SRT timecode: HH:MM:SS,mmm
 */
function formatSRTTime(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var secs = Math.floor(totalSeconds % 60);
    var millis = Math.round((totalSeconds % 1) * 1000);

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function pad3(n) { return n < 10 ? '00' + n : (n < 100 ? '0' + n : '' + n); }

    return pad2(hours) + ':' + pad2(minutes) + ':' + pad2(secs) + ',' + pad3(millis);
}

/**
 * Generate an SRT subtitle file for a clip
 * Returns the file path or null on failure
 */
function generateSRTFile(clipData, seqName) {
    try {
        var srtContent = '';
        var counter = 1;

        // Entry 1: Title overlay (0:00 - 0:03)
        if (clipData.suggestedTitle) {
            srtContent += counter + '\r\n';
            srtContent += '00:00:00,000 --> 00:00:03,000\r\n';
            srtContent += clipData.suggestedTitle + '\r\n\r\n';
            counter++;
        }

        // Build subtitle entries from subtitleSegments
        var subtitleSegs = clipData.subtitleSegments;
        if (subtitleSegs && subtitleSegs.length > 0) {
            // For multi-segment clips, we need cumulative offsets
            var segments = clipData.segments;
            var isMultiSegment = segments && segments.length > 1;

            if (isMultiSegment) {
                // Sort segments by playback order
                var orderedSegs = [];
                for (var s = 0; s < segments.length; s++) {
                    orderedSegs.push(segments[s]);
                }
                orderedSegs.sort(function(a, b) { return a.order - b.order; });

                var cumulativeTime = 0;
                for (var si = 0; si < orderedSegs.length; si++) {
                    var seg = orderedSegs[si];
                    var segDuration = seg.endTime - seg.startTime;

                    // Find subtitle segments that fall within this source range
                    for (var j = 0; j < subtitleSegs.length; j++) {
                        var sub = subtitleSegs[j];
                        if (sub.start >= seg.startTime && sub.end <= seg.endTime) {
                            var relStart = cumulativeTime + (sub.start - seg.startTime);
                            var relEnd = cumulativeTime + (sub.end - seg.startTime);
                            srtContent += counter + '\r\n';
                            srtContent += formatSRTTime(relStart) + ' --> ' + formatSRTTime(relEnd) + '\r\n';
                            srtContent += sub.text + '\r\n\r\n';
                            counter++;
                        }
                    }
                    cumulativeTime += segDuration;
                }
            } else {
                // Single segment: timestamps relative to clip start
                var clipStart = clipData.startTime;
                for (var k = 0; k < subtitleSegs.length; k++) {
                    var sub2 = subtitleSegs[k];
                    var relStart2 = sub2.start - clipStart;
                    var relEnd2 = sub2.end - clipStart;
                    if (relStart2 < 0) relStart2 = 0;
                    srtContent += counter + '\r\n';
                    srtContent += formatSRTTime(relStart2) + ' --> ' + formatSRTTime(relEnd2) + '\r\n';
                    srtContent += sub2.text + '\r\n\r\n';
                    counter++;
                }
            }
        }

        if (counter <= 1) {
            $.writeln('[AutoClipper] No subtitle content to write');
            return null;
        }

        // Write to temp file
        var safeName = seqName.replace(/[\\\/:*?"<>|]/g, '_');
        var tempPath = Folder.temp.fsName + '/autoclipper_' + safeName + '.srt';
        var f = new File(tempPath);
        f.encoding = 'UTF-8';
        f.open('w');
        f.write(srtContent);
        f.close();

        $.writeln('[AutoClipper] SRT written: ' + tempPath + ' (' + (counter - 1) + ' entries)');
        return tempPath;

    } catch (e) {
        $.writeln('[AutoClipper] generateSRTFile error: ' + e.message);
        return null;
    }
}

/**
 * Import an SRT file into the AutoClipper bin
 */
function importSRTForClip(srtPath, autoClipperBin) {
    try {
        var project = getProject();
        if (!project) return false;

        var success = project.importFiles([srtPath], true, autoClipperBin, false);
        $.writeln('[AutoClipper] SRT import result: ' + success);
        return success;
    } catch (e) {
        $.writeln('[AutoClipper] importSRTForClip error: ' + e.message);
        return false;
    }
}

/**
 * Create a single-segment sequence (legacy method)
 * Uses createNewSequenceFromClips with in/out points
 */
function createSingleSegmentSequence(clipData, seqName, sourceProjectItem, autoClipperBin, project) {
    sourceProjectItem.setInPoint(clipData.startTime, 4);
    sourceProjectItem.setOutPoint(clipData.endTime, 4);

    var newSeq = null;
    try {
        newSeq = project.createNewSequenceFromClips(seqName, [sourceProjectItem], autoClipperBin);
    } catch (seqErr) {
        $.writeln('[AutoClipper] createNewSequenceFromClips error: ' + seqErr.message);
    } finally {
        try {
            sourceProjectItem.clearInPoint(4);
            sourceProjectItem.clearOutPoint(4);
        } catch (clearErr) {
            $.writeln('[AutoClipper] Clear error: ' + clearErr.message);
        }
    }

    // Fallback if primary method failed
    if (!newSeq) {
        $.writeln('[AutoClipper] Primary method failed, trying fallback...');
        try {
            newSeq = project.createNewSequence(seqName, seqName);
            if (newSeq && newSeq.videoTracks && newSeq.videoTracks[0]) {
                sourceProjectItem.setInPoint(clipData.startTime, 4);
                sourceProjectItem.setOutPoint(clipData.endTime, 4);
                try {
                    newSeq.videoTracks[0].insertClip(sourceProjectItem, 0);
                    if (newSeq.audioTracks && newSeq.audioTracks[0]) {
                        newSeq.audioTracks[0].insertClip(sourceProjectItem, 0);
                    }
                } catch (insertErr) {
                    $.writeln('[AutoClipper] Insert error: ' + insertErr.message);
                } finally {
                    try {
                        sourceProjectItem.clearInPoint(4);
                        sourceProjectItem.clearOutPoint(4);
                    } catch (clearErr2) {
                        $.writeln('[AutoClipper] Clear error: ' + clearErr2.message);
                    }
                }

                var seqProjectItem = findSequenceProjectItem(seqName);
                if (seqProjectItem) {
                    seqProjectItem.moveBin(autoClipperBin);
                }
            }
        } catch (fallbackErr) {
            $.writeln('[AutoClipper] Fallback error: ' + fallbackErr.message);
        }
    }

    return newSeq;
}

/**
 * Create a multi-segment sequence
 * Creates empty sequence, then inserts each segment in playback order
 */
function createMultiSegmentSequence(clipData, seqName, sourceProjectItem, autoClipperBin, project) {
    var ticksPerSecond = 254016000000;

    // Sort segments by playback order
    var segments = [];
    for (var i = 0; i < clipData.segments.length; i++) {
        segments.push(clipData.segments[i]);
    }
    segments.sort(function(a, b) { return a.order - b.order; });

    $.writeln('[AutoClipper] Multi-segment: ' + segments.length + ' segments');

    // Create empty sequence
    var newSeq = null;
    try {
        newSeq = project.createNewSequence(seqName, seqName);
    } catch (seqErr) {
        $.writeln('[AutoClipper] createNewSequence error: ' + seqErr.message);
        return null;
    }

    if (!newSeq || !newSeq.videoTracks || !newSeq.videoTracks[0]) {
        $.writeln('[AutoClipper] Empty sequence creation failed');
        return null;
    }

    var insertionTicks = 0;

    for (var s = 0; s < segments.length; s++) {
        var seg = segments[s];
        $.writeln('[AutoClipper] Segment ' + (s + 1) + ': ' + seg.startTime + 's - ' + seg.endTime + 's (order ' + seg.order + ')');

        sourceProjectItem.setInPoint(seg.startTime, 4);
        sourceProjectItem.setOutPoint(seg.endTime, 4);

        try {
            newSeq.videoTracks[0].insertClip(sourceProjectItem, insertionTicks.toString());
            if (newSeq.audioTracks && newSeq.audioTracks[0]) {
                newSeq.audioTracks[0].insertClip(sourceProjectItem, insertionTicks.toString());
            }

            var segDuration = (seg.endTime - seg.startTime) * ticksPerSecond;
            insertionTicks += segDuration;

        } catch (insertErr) {
            $.writeln('[AutoClipper] Segment insert error: ' + insertErr.message);
        } finally {
            try {
                sourceProjectItem.clearInPoint(4);
                sourceProjectItem.clearOutPoint(4);
            } catch (clearErr) {
                $.writeln('[AutoClipper] Clear error: ' + clearErr.message);
            }
        }
    }

    // Move to AutoClipper bin
    var seqProjectItem = findSequenceProjectItem(seqName);
    if (seqProjectItem) {
        try {
            seqProjectItem.moveBin(autoClipperBin);
        } catch (moveErr) {
            $.writeln('[AutoClipper] Move error: ' + moveErr.message);
        }
    }

    return newSeq;
}

/**
 * Create multiple sequences from clips in batch
 * Supports both single-segment and multi-segment clips
 * Generates SRT subtitle files for each clip
 */
function createSequencesBatch(clipsArrayJSON, presetId) {
    $.writeln('[AutoClipper] === createSequencesBatch START ===');

    var project = getProject();
    if (!project) {
        return JSON.stringify({ success: false, error: 'No project open', results: [] });
    }

    var results = [];

    try {
        var clips = JSON.parse(clipsArrayJSON);
        $.writeln('[AutoClipper] Processing ' + clips.length + ' clips');

        // CRITICAL: Get source item ONCE before any sequence creation
        var sourceProjectItem = getSourceProjectItem();
        if (!sourceProjectItem) {
            return JSON.stringify({
                success: false,
                error: 'Select the source video in the Project Panel first',
                results: []
            });
        }
        $.writeln('[AutoClipper] Source locked: ' + sourceProjectItem.name);

        // Get/create bin ONCE
        var autoClipperBin = getOrCreateAutoClipperBin();
        if (!autoClipperBin) {
            return JSON.stringify({
                success: false,
                error: 'Could not create AutoClipper bin',
                results: []
            });
        }

        // Process each clip
        for (var i = 0; i < clips.length; i++) {
            var clipData = clips[i];
            var clipResult = { index: i, title: clipData.suggestedTitle || 'Clip ' + (i + 1) };

            try {
                // Sanitize name
                var seqName = (clipData.suggestedTitle || 'AutoClip_' + Date.now() + '_' + i);
                seqName = seqName.replace(/[\\\/:*?"<>|]/g, '_').substring(0, 50);

                $.writeln('[AutoClipper] Creating: ' + seqName + ' (' + (i + 1) + '/' + clips.length + ')');

                var newSeq = null;

                // Check if multi-segment clip
                var isMultiSegment = clipData.segments && clipData.segments.length > 1;

                if (isMultiSegment) {
                    newSeq = createMultiSegmentSequence(clipData, seqName, sourceProjectItem, autoClipperBin, project);
                } else {
                    newSeq = createSingleSegmentSequence(clipData, seqName, sourceProjectItem, autoClipperBin, project);
                }

                // Generate and import SRT if subtitle data exists
                if (presetId !== 'none' && clipData.subtitleSegments && clipData.subtitleSegments.length > 0) {
                    var srtPath = generateSRTFile(clipData, seqName);
                    if (srtPath) {
                        importSRTForClip(srtPath, autoClipperBin);
                        clipResult.srtGenerated = true;
                    }
                }

                clipResult.success = true;
                clipResult.sequenceName = seqName;
                clipResult.segmentCount = isMultiSegment ? clipData.segments.length : 1;

            } catch (clipErr) {
                clipResult.success = false;
                clipResult.error = clipErr.message;
                $.writeln('[AutoClipper] Clip error: ' + clipErr.message);
            }

            results.push(clipResult);
        }

        $.writeln('[AutoClipper] === createSequencesBatch COMPLETE ===');

        var successCount = 0;
        for (var j = 0; j < results.length; j++) {
            if (results[j].success) successCount++;
        }

        return JSON.stringify({
            success: true,
            created: successCount,
            total: clips.length,
            results: results
        });

    } catch (e) {
        $.writeln('[AutoClipper] BATCH FATAL ERROR: ' + e.message);
        return JSON.stringify({
            success: false,
            error: e.message,
            results: results
        });
    }
}

/**
 * Export sequences to Media Encoder
 */
function exportSequences(sequenceNamesJSON, outputPath, presetPath) {
    var project = getProject();
    if (!project) return 'error: No project open';

    try {
        var sequenceNames = JSON.parse(sequenceNamesJSON);
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

        for (var k = 0; k < sequences.length; k++) {
            var seq = sequences[k];
            var outputFile = outputPath + '/' + seq.name + '.mp4';

            app.encoder.encodeSequence(
                seq,
                outputFile,
                presetPath,
                app.encoder.ENCODE_WORKAREA,
                1
            );
        }

        app.encoder.startBatch();
        return 'ok';

    } catch (e) {
        return 'error: ' + e.message;
    }
}

/**
 * Create markers at viral moments
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
                marker.setColorByIndex(3);
            }
        }

        return 'ok';

    } catch (e) {
        return 'error: ' + e.message;
    }
}

/**
 * Get project info for debugging
 */
function getProjectInfo() {
    var project = getProject();
    if (!project) return '{"error": "No project"}';

    try {
        var seq = getActiveSequence();
        var info = {
            name: project.name,
            path: project.path,
            hasActiveSequence: !!seq,
            sequenceName: seq ? seq.name : null,
            sequenceCount: project.sequences.numSequences
        };
        return JSON.stringify(info);
    } catch (e) {
        return '{"error": "' + e.message + '"}';
    }
}

/**
 * Simple test function to verify script is loaded
 */
function testExtendScript() {
    try {
        return 'ExtendScript OK - ' + new Date().toISOString();
    } catch (e) {
        return 'ExtendScript ERROR - ' + e.message;
    }
}

// Log initialization
try {
    $.writeln('[AutoClipper] ExtendScript loaded successfully');
    $.writeln('[AutoClipper] Version: ' + $.version);
    if (typeof app !== 'undefined') {
        $.writeln('[AutoClipper] App: ' + app.name + ' ' + app.version);
    }
} catch (logErr) {
    // Ignore logging errors
}
