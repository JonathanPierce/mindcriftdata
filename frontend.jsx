/*
    DATA LAYER
*/
var Processors = (function() {
    var processors = {};
    var stateHandler = null;
    var state = {
        page: "experiments",
        experiments: {},
        config: null
    };

    // Registers a new processor for an experiment
    var register = function(exName, procFuncs) {
        processors[exName] = procFuncs;
    };

    // Requests that we process global/instance data for a specific experiment
    var processGlobal = function(name) {
        var data = state.experiments[name];
        var processor = processors[name].globalStats;

        if(data && processor) {
            var result = processor(data);
            console.log("Processed data for experiment " + name + ":");
            console.log(result);
            return result;
        }

        return null;
    };

    var processInstance = function(exName, instance) {
        var data = state.experiments[exName];
        var processor = processors[exName].instanceStats;

        if(data && processor) {
            var result = processor(data);
            console.log("Processed data for experiment " + exName + " instance " + instance + ":");
            console.log(result);
            return result;
        }

        return null;
    };

    // Sets the callback, downloads experiment info, relavent data, and processing scripts.
    var start = function(handler) {
        stateHandler = handler;

        // Get the config
        $.get("/file?path=config.json", function(config) {
            state.config = config;

            console.log("Received config:");
            console.log(config);

            var expectedCount = config.length;
            var receivedCount = 0;

            config.map(function(entry) {
                // Grab the data from the DB
                $.get("/experiment?name=" + entry.name, function(entries) {
                    // Add the data to the local DB
                    console.log("Got experiment info for " + entry.name + ":");
                    console.log(entries);
                    state.experiments[entry.name] = entries;

                    // Then, grab the processing script
                    var script = document.createElement("SCRIPT");
                    script.addEventListener("load", function() {
                        // We did it, hooray.
                        receivedCount += 1;
                        console.log("Processing script loaded for " + entry.name + ".");

                        // Should we flush?
                        if(receivedCount == expectedCount) {
                            console.log("All done!");
                            flush();
                        }
                    });
                    script.src = "/file?path=experiments/" + entry.script;
                    document.body.appendChild(script);
                }).fail(function() {
                    console.log("Failed to get experiment info for " + entry.name + ". :(");
                });
            });
        }).fail(function() {
            console.log("Failed to get config. :(");
        });
    };

    // Allows you to set state
    var setState = function(newState) {
        state = newState;
        flush();
    }

    // Flushes the state to the UI, forcing a render
    var flush = function() {
        stateHandler && stateHandler(state);
    }

    // Return out the interface
    return {
        register: register,
        setState: setState,
        start: start,
        processGlobal: processGlobal,
        processInstance: processInstance
    };
})();

// Test code
Processors.start(function(data) {
    console.log("Received flushed data!");
    console.log(data);
});
