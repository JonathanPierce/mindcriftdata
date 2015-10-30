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
                        if(receivedCount === expectedCount) {
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

        // Start the socketIO server
        var socket = io("http://localhost:3000");
        socket.on("newData", function(data) {
            // Find or create correct entry
            var experiment = state.experiments[data.experiment];
            if(experiment) {
                // Update the DB
                var found = null;
                for(var i = 0; i < experiment.length; i++) {
                    var current = experiment[i];

                    if(current.subject === data.subject) {
                        found = current;
                    }
                }

                // Create a new subject if not found
                if(!found) {
                    found = {
                        subject: data.subject,
                        data: []
                    };
                    experiment.push(found);
                }

                // Add the new entry
                found.data.push(data);

                // Flush to UI
                flush();
            }
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

/*
    TEST CODE
*/
var Tester = (function() {
    // Starts the machine running...
    var start = function() {
        Processors.start(function(data) {
            console.log("Received flushed data!");
            console.log(data);
        });
    };

    // Simulates a ProbMatch experiment
    var simulate = function() {
        var subject = Math.floor(100000000 * Math.random());

        // start
        $.post("/save", JSON.stringify({
            experiment: "ProbMatch",
            subject: subject,
            event: "Start",
            args: null
        }), function() {
            console.log("Started subject " + subject + ".");

            // 25-50 left/right events
            var count = 0;
            var maxCount = 25 + Math.floor(25 * Math.random());

            var leftRight = function() {
                setTimeout(function() {
                    $.post("/save", JSON.stringify({
                        experiment: "ProbMatch",
                        subject: subject,
                        event: "BlockBroken",
                        args: {
                            left: Math.random() > 0.5
                        }
                    }), function() {
                        count += 1;

                        if(count >= maxCount) {
                            end();
                        } else {
                            leftRight();
                        }
                    }).fail(function() {});
                }, 4000 * Math.random());
            };

            var end = function() {
                $.post("/save", JSON.stringify({
                    experiment: "ProbMatch",
                    subject: subject,
                    event: "End",
                    args: null
                }), function() {
                    console.log("Finished subject " + subject + ".");
                }).fail(function() {});
            };

            // Start it up
            leftRight();
        }).fail(function() {});
    };

    // Return out an interface
    return {
        start: start,
        simulate: simulate
    };
})();
