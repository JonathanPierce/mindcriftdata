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
        var processor = processors[exName].instanceStats;

        if(instance && processor) {
            var result = processor(instance);
            console.log("Processed data for experiment " + exName + " instance:");
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

/*
UI COMPONENTS
*/

var Application = React.createClass({
    getInitialState: function() {
        return null;
    },
    componentDidMount: function() {
        Processors.start(this.update)
    },
    update: function(newState) {
        this.setState(newState);
    },
    renderPage: function() {
        var state = this.state;

        if(state.page === "experiments") {
            return (
                <ExperimentList data={state} />
            );
        }

        if(state.page === "detail") {
            return (
                <DetailPage data={state} />
            )
        }
    },
    render: function() {
        if(this.state === null) {
            return <div>loading... please wait...</div>;
        }

        var page = this.renderPage();

        return (
            <div>
                <div className="header">
                    <h1>Mindcrift Data</h1>
                </div>
                <div className="page">
                    { page }
                </div>
            </div>
        );
    }
});

var ExperimentList = React.createClass({
    selectExperiment: function(experiment) {
        var data = this.props.data;
        data.page = "detail";
        data.experiment = experiment.name;
        data.instanceIndex = 0;

        Processors.setState(data);
    },
    render: function() {
        var data = this.props.data;
        var config = data.config;
        var that = this;

        return (
            <table className="mainSection experimentList center">
                <tbody>
                    <tr className="tableHeader">
                        <td colSpan="2">Experiments</td>
                    </tr>
                    {
                        config.map(function(experiment) {
                            var handler = function() {
                                that.selectExperiment(experiment);
                            };

                            return (
                                <tr key={experiment.name} className="experimentListing" onClick={handler}>
                                    <td>
                                        <h3>{experiment.longName}</h3>
                                        <div className="description">{experiment.description}</div>
                                    </td>
                                    <td className="particCount">{data.experiments[experiment.name].length + " participants"}</td>
                                </tr>
                            );
                        })
                    }
                </tbody>
            </table>
        );
    }
});

var DetailPage = React.createClass({
    render: function() {
        return (
            <div className="detailPage">
                <ExperimentTitle data={this.props.data} />
                <GlobalStats data={this.props.data} />
                <InstanceList data={this.props.data} />
            </div>
        );
    }
});

var ExperimentTitle = React.createClass({
    goBack: function() {
        var data = this.props.data;
        data.page = "experiments";
        Processors.setState(data);
    },
    render: function() {
        // Find the correct config entry
        var data = this.props.data;
        var experiment = data.experiment;
        var config = data.config;

        var current = null;
        for(var i = 0; i < config.length; i++) {
            if(config[i].name === experiment) {
                current = config[i];
                break;
            }
        }

        // Render back button, title, and description
        return (
            <div className="experimentTitle">
                <button onClick={this.goBack}>back to experiment list</button>
                <h2>{current.longName}</h2>
                <div>{current.description}</div>
            </div>
        );
    }
});

var GlobalStats = React.createClass({
    getInitialState: function() {
        return {
            pairs: []
        };
    },
    componentDidMount: function() {
        this.refresh();
    },
    refresh: function() {
        var pairs = Processors.processGlobal(this.props.data.experiment);
        this.setState({
            pairs: pairs
        });
    },
    render: function() {
        var data = this.props.data;

        return (
            <div className="globalStats">
                <table className="pairTable">
                    <tbody>
                        <tr>
                            <td className="left">Participants</td>
                            <td className="right">{data.experiments[data.experiment].length}</td>
                        </tr>
                        {
                            this.state.pairs.map(function(pair) {
                                return (
                                    <tr key={pair.name}>
                                        <td className="left">{pair.name}</td>
                                        <td className="right">{pair.value}</td>
                                    </tr>
                                );
                            })
                        }
                    </tbody>
                </table>
                <button onClick={this.refresh} title="experiment stats don't auto-update for performance reasons">refresh experiment stats</button>
            </div>
        );
    }
});

var InstanceList = React.createClass({
    changeSubject: function(e) {
        var data = this.props.data;
        data.instanceIndex = e.target.selectedIndex;
        Processors.setState(data);
    },
    nextSubject: function() {
        var data = this.props.data;
        if(data.instanceIndex < data.experiments[data.experiment].length - 1) {
            data.instanceIndex++;
            Processors.setState(data);
        }
    },
    prevSubject: function() {
        var data = this.props.data;
        if(data.instanceIndex >= 1) {
            data.instanceIndex--;
            Processors.setState(data);
        }
    },
    renderDropdown: function() {
        var data = this.props.data;
        var instances = data.experiments[data.experiment];
        instances.sort(function(a,b) {
            return a.subject - b.subject;
        });

        return (
            <select value={data.instanceIndex} onChange={this.changeSubject}>
                {
                    instances.map(function(instance, index) {
                        return <option value={index} key={instance.subject}>{instance.subject}</option>;
                    })
                }
            </select>
        );
    },
    render: function() {
        var data = this.props.data;

        return (
            <table className="mainSection instanceList">
                <tbody>
                    <tr className="tableHeader">
                        <td>Instances</td>
                    </tr>
                    <tr>
                        <td className="instanceSelector">
                            { this.renderDropdown() }
                            <button onClick={this.prevSubject}>previous</button>
                            <button onClick={this.nextSubject}>next</button>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <InstanceStats data={data} />
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <EventViewer data={data} />
                        </td>
                    </tr>
                </tbody>
            </table>
        );
    }
});

var InstanceStats = React.createClass({
    isComplete: function(instance) {
        var data = instance.data;

        var hasStart = false;
        var hasEnd = false;

        for(var i = 0; i < data.length; i++) {
            if(data[i].event === "Start") {
                hasStart = true;
            }
            if(data[i].event === "End") {
                hasEnd = true;
            }
        }

        return hasStart && hasEnd;
    },
    render: function() {
        var data = this.props.data;
        var instance = data.experiments[data.experiment][data.instanceIndex];

        if(!instance) {
            return <div>no data yet...</div>;
        }

        var pairs = Processors.processInstance(data.experiment, instance.data);

        return (
            <table className="instanceStats pairTable">
                <tbody>
                    <tr>
                        <td className="left">Complete</td>
                        <td className="right">{this.isComplete(instance) ? "True" : "False"}</td>
                    </tr>
                    {
                        pairs.map(function(pair) {
                            return (
                                <tr key={pair.name}>
                                    <td className="left">{pair.name}</td>
                                    <td className="right">{pair.value}</td>
                                </tr>
                            );
                        })
                    }
                </tbody>
            </table>
        );
    }
});

var EventViewer = React.createClass({
    render: function() {
        var data = this.props.data;
        var instance = data.experiments[data.experiment][data.instanceIndex];

        if(!instance) {
            return <div>no data yet...</div>;
        }

        var events = instance.data;
        events.sort(function(a,b) {
            return a.time - b.time;
        });

        return (
            <table className="instanceStats pairTable">
                <tbody>
                    {
                        events.map(function(ev) {
                            return (
                                <tr key={ev.time}>
                                    <td className="left">{ev.event}</td>
                                    <td className="right">{ev.args ? JSON.stringify(ev.args) : "no arguments"}</td>
                                </tr>
                            );
                        })
                    }
                </tbody>
            </table>
        );
    }
});
