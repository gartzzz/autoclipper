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
 * Create multiple sequences from clips in batch
 * Captures source item ONCE at start to avoid selection issues
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

                // CRITICAL: Use try-finally to ALWAYS clear in/out points
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

                clipResult.success = true;
                clipResult.sequenceName = seqName;

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
