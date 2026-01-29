/**
 * CSInterface - Adobe CEP Library
 * Minimal implementation for communication between HTML panel and ExtendScript
 *
 * Full version available at: https://github.com/Adobe-CEP/CEP-Resources
 */

/**
 * Stores the path information from CEP
 */
var SystemPath = {
    EXTENSION: "extension",
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    HOST_APPLICATION: "hostApplication"
};

/**
 * CSInterface class for communication with host application
 */
function CSInterface() {
    this.hostEnvironment = window.__adobe_cep__ ? JSON.parse(window.__adobe_cep__.getHostEnvironment()) : null;
}

/**
 * Theme change event
 */
CSInterface.THEME_COLOR_CHANGED_EVENT = "com.adobe.csxs.events.ThemeColorChanged";

/**
 * Retrieves the host environment data
 */
CSInterface.prototype.getHostEnvironment = function() {
    if (window.__adobe_cep__) {
        return JSON.parse(window.__adobe_cep__.getHostEnvironment());
    }
    // Return mock environment for testing outside Premiere
    return {
        appName: "PPRO",
        appVersion: "24.0",
        appLocale: "en_US",
        appUILocale: "en_US",
        appSkinInfo: {
            panelBackgroundColor: { color: { red: 30, green: 30, blue: 30 } },
            baseFontSize: 12
        }
    };
};

/**
 * Retrieves the system path for given type
 */
CSInterface.prototype.getSystemPath = function(type) {
    if (window.__adobe_cep__) {
        return window.__adobe_cep__.getSystemPath(type);
    }
    return "";
};

/**
 * Evaluates a JavaScript script in the host application
 */
CSInterface.prototype.evalScript = function(script, callback) {
    if (window.__adobe_cep__) {
        window.__adobe_cep__.evalScript(script, callback);
    } else {
        // Mock for testing
        console.log("evalScript (mock):", script);
        if (callback) {
            callback("mock_result");
        }
    }
};

/**
 * Register event listener for CEP events
 */
CSInterface.prototype.addEventListener = function(type, listener, useCapture) {
    if (window.__adobe_cep__) {
        window.__adobe_cep__.addEventListener(type, listener, useCapture);
    }
};

/**
 * Remove event listener
 */
CSInterface.prototype.removeEventListener = function(type, listener, useCapture) {
    if (window.__adobe_cep__) {
        window.__adobe_cep__.removeEventListener(type, listener, useCapture);
    }
};

/**
 * Dispatch event to host application
 */
CSInterface.prototype.dispatchEvent = function(event) {
    if (window.__adobe_cep__) {
        window.__adobe_cep__.dispatchEvent(event);
    }
};

/**
 * Request opening a URL in default browser
 */
CSInterface.prototype.openURLInDefaultBrowser = function(url) {
    if (window.__adobe_cep__) {
        window.__adobe_cep__.openURLInDefaultBrowser(url);
    } else {
        window.open(url, "_blank");
    }
};

/**
 * Get extension ID
 */
CSInterface.prototype.getExtensionID = function() {
    if (window.__adobe_cep__) {
        return window.__adobe_cep__.getExtensionId();
    }
    return "com.gartzzz.autoclipper.panel";
};

/**
 * Close extension
 */
CSInterface.prototype.closeExtension = function() {
    if (window.__adobe_cep__) {
        window.__adobe_cep__.closeExtension();
    }
};

/**
 * CSEvent class for dispatching events
 */
function CSEvent(type, scope, appId, extensionId) {
    this.type = type;
    this.scope = scope;
    this.appId = appId || "";
    this.extensionId = extensionId || "";
    this.data = "";
}

// Export for module systems
if (typeof module !== "undefined" && module.exports) {
    module.exports = { CSInterface: CSInterface, CSEvent: CSEvent, SystemPath: SystemPath };
}
