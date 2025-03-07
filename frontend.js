/*
    DATA LAYER
*/
"use strict";

var Processors = (function () {
    var processors = {};
    var stateHandler = null;
    var state = {
        page: "experiments",
        experiments: {},
        config: null
    };

    // Registers a new processor for an experiment
    var register = function register(exName, procFuncs) {
        processors[exName] = procFuncs;
    };

    // Requests that we process global/instance data for a specific experiment
    var processGlobal = function processGlobal(name) {
        var data = state.experiments[name];
        var processor = processors[name].globalStats;

        if (data && processor) {
            var result = processor(data);
            console.log("Processed data for experiment " + name + ":");
            console.log(result);
            return result;
        }

        return null;
    };

    var processInstance = function processInstance(exName, instance) {
        var processor = processors[exName].instanceStats;

        if (instance && processor) {
            var result = processor(instance);
            console.log("Processed data for experiment " + exName + " instance:");
            console.log(result);
            return result;
        }

        return null;
    };

    // Sets the callback, downloads experiment info, relavent data, and processing scripts.
    var start = function start(handler) {
        stateHandler = handler;

        // Get the config
        $.get("/file?path=config.json", function (config) {
            state.config = config;

            console.log("Received config:");
            console.log(config);

            var expectedCount = config.length;
            var receivedCount = 0;

            config.map(function (entry) {
                // Grab the data from the DB
                $.get("/experiment?name=" + entry.name, function (entries) {
                    // Add the data to the local DB
                    console.log("Got experiment info for " + entry.name + ":");
                    console.log(entries);
                    state.experiments[entry.name] = entries;

                    // Then, grab the processing script
                    var script = document.createElement("SCRIPT");
                    script.addEventListener("load", function () {
                        // We did it, hooray.
                        receivedCount += 1;
                        console.log("Processing script loaded for " + entry.name + ".");

                        // Should we flush?
                        if (receivedCount === expectedCount) {
                            console.log("All done!");
                            flush();
                        }
                    });
                    script.src = "/file?path=experiments/" + entry.script;
                    document.body.appendChild(script);
                }).fail(function () {
                    console.log("Failed to get experiment info for " + entry.name + ". :(");
                });
            });
        }).fail(function () {
            console.log("Failed to get config. :(");
        });

        // Start the socketIO server
        var socket = io("http://localhost:3000");
        socket.on("newData", function (data) {
            // Find or create correct entry
            var experiment = state.experiments[data.experiment];
            if (experiment) {
                // Update the DB
                var found = null;
                for (var i = 0; i < experiment.length; i++) {
                    var current = experiment[i];

                    if (current.subject === data.subject) {
                        found = current;
                    }
                }

                // Create a new subject if not found
                if (!found) {
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
    var setState = function setState(newState) {
        state = newState;
        flush();
    };

    // Flushes the state to the UI, forcing a render
    var flush = function flush() {
        stateHandler && stateHandler(state);
    };

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
var Tester = (function () {
    // Starts the machine running...
    var start = function start() {
        Processors.start(function (data) {
            console.log("Received flushed data!");
            console.log(data);
        });
    };

    // Simulates a ProbMatch experiment
    var simulate = function simulate() {
        var subject = Math.floor(100000000 * Math.random());

        // start
        $.post("/save", JSON.stringify({
            experiment: "ProbMatch",
            subject: subject,
            event: "Start",
            args: null
        }), function () {
            console.log("Started subject " + subject + ".");

            // 25-50 left/right events
            var count = 0;
            var maxCount = 25 + Math.floor(25 * Math.random());

            var leftRight = function leftRight() {
                setTimeout(function () {
                    $.post("/save", JSON.stringify({
                        experiment: "ProbMatch",
                        subject: subject,
                        event: "ButtonPress",
                        args: {
                            left: Math.random() > 0.5
                        }
                    }), function () {
                        count += 1;

                        if (count >= maxCount) {
                            end();
                        } else {
                            leftRight();
                        }
                    }).fail(function () {});
                }, 4000 * Math.random());
            };

            var end = function end() {
                $.post("/save", JSON.stringify({
                    experiment: "ProbMatch",
                    subject: subject,
                    event: "End",
                    args: null
                }), function () {
                    console.log("Finished subject " + subject + ".");
                }).fail(function () {});
            };

            // Start it up
            leftRight();
        }).fail(function () {});
    };

    // Return out an interface
    return {
        start: start,
        simulate: simulate
    };
})();

/*
UI COMPONENTS
*/

var Application = React.createClass({
    displayName: "Application",

    getInitialState: function getInitialState() {
        return null;
    },
    componentDidMount: function componentDidMount() {
        Processors.start(this.update);
    },
    update: function update(newState) {
        this.setState(newState);
    },
    renderPage: function renderPage() {
        var state = this.state;

        if (state.page === "experiments") {
            return React.createElement(ExperimentList, { data: state });
        }

        if (state.page === "detail") {
            return React.createElement(DetailPage, { data: state });
        }
    },
    render: function render() {
        if (this.state === null) {
            return React.createElement(
                "div",
                null,
                "loading... please wait..."
            );
        }

        var page = this.renderPage();

        return React.createElement(
            "div",
            null,
            React.createElement(
                "div",
                { className: "header" },
                React.createElement(
                    "h1",
                    null,
                    "Mindcraft Data"
                )
            ),
            React.createElement(
                "div",
                { className: "page" },
                page
            )
        );
    }
});

var ExperimentList = React.createClass({
    displayName: "ExperimentList",

    selectExperiment: function selectExperiment(experiment) {
        var data = this.props.data;
        data.page = "detail";
        data.experiment = experiment.name;
        data.instanceIndex = 0;

        Processors.setState(data);
    },
    render: function render() {
        var data = this.props.data;
        var config = data.config;
        var that = this;

        return React.createElement(
            "table",
            { className: "mainSection experimentList center" },
            React.createElement(
                "tbody",
                null,
                React.createElement(
                    "tr",
                    { className: "tableHeader" },
                    React.createElement(
                        "td",
                        { colSpan: "2" },
                        "Experiments"
                    )
                ),
                config.map(function (experiment) {
                    var handler = function handler() {
                        that.selectExperiment(experiment);
                    };

                    return React.createElement(
                        "tr",
                        { key: experiment.name, className: "experimentListing", onClick: handler },
                        React.createElement(
                            "td",
                            null,
                            React.createElement(
                                "h3",
                                null,
                                experiment.longName
                            ),
                            React.createElement(
                                "div",
                                { className: "description" },
                                experiment.description
                            )
                        ),
                        React.createElement(
                            "td",
                            { className: "particCount" },
                            data.experiments[experiment.name].length + " participants"
                        )
                    );
                })
            )
        );
    }
});

var DetailPage = React.createClass({
    displayName: "DetailPage",

    render: function render() {
        return React.createElement(
            "div",
            { className: "detailPage" },
            React.createElement(ExperimentTitle, { data: this.props.data }),
            React.createElement(GlobalStats, { data: this.props.data }),
            React.createElement(InstanceList, { data: this.props.data })
        );
    }
});

var ExperimentTitle = React.createClass({
    displayName: "ExperimentTitle",

    goBack: function goBack() {
        var data = this.props.data;
        data.page = "experiments";
        Processors.setState(data);
    },
    render: function render() {
        // Find the correct config entry
        var data = this.props.data;
        var experiment = data.experiment;
        var config = data.config;

        var current = null;
        for (var i = 0; i < config.length; i++) {
            if (config[i].name === experiment) {
                current = config[i];
                break;
            }
        }

        // Render back button, title, and description
        return React.createElement(
            "div",
            { className: "experimentTitle" },
            React.createElement(
                "button",
                { onClick: this.goBack },
                "back to experiment list"
            ),
            React.createElement(
                "h2",
                null,
                current.longName
            ),
            React.createElement(
                "div",
                null,
                current.description
            )
        );
    }
});

var GlobalStats = React.createClass({
    displayName: "GlobalStats",

    getInitialState: function getInitialState() {
        return {
            pairs: []
        };
    },
    componentDidMount: function componentDidMount() {
        this.refresh();
    },
    refresh: function refresh() {
        var pairs = Processors.processGlobal(this.props.data.experiment);
        this.setState({
            pairs: pairs
        });
    },
    render: function render() {
        var data = this.props.data;

        return React.createElement(
            "div",
            { className: "globalStats" },
            React.createElement(
                "table",
                { className: "pairTable" },
                React.createElement(
                    "tbody",
                    null,
                    React.createElement(
                        "tr",
                        null,
                        React.createElement(
                            "td",
                            { className: "left" },
                            "Participants"
                        ),
                        React.createElement(
                            "td",
                            { className: "right" },
                            data.experiments[data.experiment].length
                        )
                    ),
                    this.state.pairs.map(function (pair) {
                        return React.createElement(
                            "tr",
                            { key: pair.name },
                            React.createElement(
                                "td",
                                { className: "left" },
                                pair.name
                            ),
                            React.createElement(
                                "td",
                                { className: "right" },
                                pair.value
                            )
                        );
                    })
                )
            ),
            React.createElement(
                "button",
                { onClick: this.refresh, title: "experiment stats don't auto-update for performance reasons" },
                "refresh experiment stats"
            )
        );
    }
});

var InstanceList = React.createClass({
    displayName: "InstanceList",

    changeSubject: function changeSubject(e) {
        var data = this.props.data;
        data.instanceIndex = e.target.selectedIndex;
        Processors.setState(data);
    },
    nextSubject: function nextSubject() {
        var data = this.props.data;
        if (data.instanceIndex < data.experiments[data.experiment].length - 1) {
            data.instanceIndex++;
            Processors.setState(data);
        }
    },
    prevSubject: function prevSubject() {
        var data = this.props.data;
        if (data.instanceIndex >= 1) {
            data.instanceIndex--;
            Processors.setState(data);
        }
    },
    renderDropdown: function renderDropdown() {
        var data = this.props.data;
        var instances = data.experiments[data.experiment];
        instances.sort(function (a, b) {
            return a.subject - b.subject;
        });

        return React.createElement(
            "select",
            { value: data.instanceIndex, onChange: this.changeSubject },
            instances.map(function (instance, index) {
                return React.createElement(
                    "option",
                    { value: index, key: instance.subject },
                    instance.subject
                );
            })
        );
    },
    render: function render() {
        var data = this.props.data;

        return React.createElement(
            "table",
            { className: "mainSection instanceList" },
            React.createElement(
                "tbody",
                null,
                React.createElement(
                    "tr",
                    { className: "tableHeader" },
                    React.createElement(
                        "td",
                        null,
                        "Instances"
                    )
                ),
                React.createElement(
                    "tr",
                    null,
                    React.createElement(
                        "td",
                        { className: "instanceSelector" },
                        this.renderDropdown(),
                        React.createElement(
                            "button",
                            { onClick: this.prevSubject },
                            "previous"
                        ),
                        React.createElement(
                            "button",
                            { onClick: this.nextSubject },
                            "next"
                        )
                    )
                ),
                React.createElement(
                    "tr",
                    null,
                    React.createElement(
                        "td",
                        null,
                        React.createElement(InstanceStats, { data: data })
                    )
                ),
                React.createElement(
                    "tr",
                    null,
                    React.createElement(
                        "td",
                        null,
                        React.createElement(EventViewer, { data: data })
                    )
                )
            )
        );
    }
});

var InstanceStats = React.createClass({
    displayName: "InstanceStats",

    isComplete: function isComplete(instance) {
        var data = instance.data;

        var hasStart = false;
        var hasEnd = false;

        for (var i = 0; i < data.length; i++) {
            if (data[i].event === "Start") {
                hasStart = true;
            }
            if (data[i].event === "End") {
                hasEnd = true;
            }
        }

        return hasStart && hasEnd;
    },
    render: function render() {
        var data = this.props.data;
        var instance = data.experiments[data.experiment][data.instanceIndex];

        if (!instance) {
            return React.createElement(
                "div",
                null,
                "no data yet..."
            );
        }

        var pairs = Processors.processInstance(data.experiment, instance.data);

        return React.createElement(
            "table",
            { className: "instanceStats pairTable" },
            React.createElement(
                "tbody",
                null,
                React.createElement(
                    "tr",
                    null,
                    React.createElement(
                        "td",
                        { className: "left" },
                        "Complete"
                    ),
                    React.createElement(
                        "td",
                        { className: "right" },
                        this.isComplete(instance) ? "True" : "False"
                    )
                ),
                pairs.map(function (pair) {
                    return React.createElement(
                        "tr",
                        { key: pair.name },
                        React.createElement(
                            "td",
                            { className: "left" },
                            pair.name
                        ),
                        React.createElement(
                            "td",
                            { className: "right" },
                            pair.value
                        )
                    );
                })
            )
        );
    }
});

var EventViewer = React.createClass({
    displayName: "EventViewer",

    render: function render() {
        var data = this.props.data;
        var instance = data.experiments[data.experiment][data.instanceIndex];

        if (!instance) {
            return React.createElement(
                "div",
                null,
                "no data yet..."
            );
        }

        var events = instance.data;
        events.sort(function (a, b) {
            return a.time - b.time;
        });

        return React.createElement(
            "table",
            { className: "instanceStats pairTable" },
            React.createElement(
                "tbody",
                null,
                events.map(function (ev) {
                    return React.createElement(
                        "tr",
                        { key: ev.time },
                        React.createElement(
                            "td",
                            { className: "left" },
                            ev.event
                        ),
                        React.createElement(
                            "td",
                            { className: "right" },
                            ev.args ? JSON.stringify(ev.args) : "no arguments"
                        )
                    );
                })
            )
        );
    }
});

