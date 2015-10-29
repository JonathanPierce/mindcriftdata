var http = require('http');
var url = require('url');
var mongodb = require('mongodb').MongoClient;
var socket = require('socket.io');
var fs = require('fs');

// Gets a true MIME for a path
var get_mime = function (path) {
    if (/\.js$/.test(path)) {
        return "text/javascript";
    }
    if (/\.css$/.test(path)) {
        return "text/css";
    }
    if (/\.json$/.test(path)) {
        return "text/json";
    }
    if (/\.pdf$/.test(path)) {
        return "application/pdf";
    }
    if (/\.png$/.test(path)) {
        return "image/png";
    }
    if (/\.jpeg$/.test(path)) {
        return "image/jpeg";
    }
    if (/\.class$/.test(path)) {
        return "application/java-vm";
    }
    return "text/plain";
};

// Function for reading a file from disk
var get_file = function (path, callback) {
    fs.readFile(__dirname + "/" + path, function (err, data) {
        if (err) {
            error_log(err);
            callback(null);
            return;
        }

        // Return the data
        callback(data);
    })
};

// Connect to the database upon launch.
var db_master = null;
var db = null;
mongodb.connect("mongodb://localhost:27017/mindcrift", function (error, database) {
    if (error) {
        console.log("Remember to start the database!");
        console.log("mongod --dbpath C:\Users\Jonathan\MongoDB");
        throw error;
    }

    // Populate the database object
    db_master = database;
    db = db_master.collection("entries");
    console.log("Datebase conenction established successfully.")
});

// Responders for requests at a given path.
var responders = {
    // Returns the file at ?path=path/to/file.ext
    "/file": function (req, res) {
        var parsed_url = url.parse(req.url, true);
        var file_path = parsed_url.query.path;

        if (file_path) {
            // Set the correct file type
            var file_type = get_mime(file_path);

            // Grab the file and return it
            get_file(file_path, function (data) {
                if (data) {
                    res.writeHead(200, { 'Content-Type': file_type });
                    res.end(data);
                } else {
                    // 404
                    responders["404"](req, res);
                }

            });
        } else {
            // 404
            responders["404"](req, res);
        }
    },

    // Return the home page HTML
    "/": function (req, res) {
        get_file("index.html", function (data) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    },

    "/save": function(req, res) {
        var body = "";

        req.on("data", function(chunk) {
            body += chunk.toString();
        });

        req.on("end", function() {
            try {
                // JSON parse the request
                var entity = JSON.parse(body);

                // Save into the DB
                db.insertOne(entity, function(error, result) {
                    if(error) {
                        // 404
                        console.log(error);
                        responders["404"](req, res);
                    } else {
                        // TODO: Handle the socket

                        // Success
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('OK\n');
                    }
                });
            } catch(ex) {
                // 404
                responders["404"](req, res);
            }
        })
    },

    "/experiment": function(req, res) {
        var parsed_url = url.parse(req.url, true);
        var experiment = parsed_url.query.name;

        db.find({
            experiment: experiment
        }).toArray(function(error, entries) {
            if(error) {
                // 404
                console.log(error);
                responders["404"](req, res);
            } else {
                // Clean up the data
                var subjects = {};

                for(var i = 0; i < entries.length; i++) {
                    var entry = entries[i];

                    if(!subjects[entry.subject]) {
                        subjects[entry.subject] = []
                    }

                    subjects[entry.subject].push(entry);
                }

                var results = [];

                for(var key in subjects) {
                    if(subjects.hasOwnProperty(key)) {
                        results.push({
                            subject: key,
                            data: subjects[key]
                        });
                    }
                }

                // Flush to client
                res.writeHead(200, { 'Content-Type': 'text/json' });
                res.end(JSON.stringify(results));
            }
        });
    },

    // Return a 404 page
    "404": function (req, res) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Hmm... it seems that we are unable to handle that request.\n');
    }
};

// The main server listener
http.createServer(function (req, res) {
    var parsed_url = url.parse(req.url);

    var responder = responders[parsed_url.pathname];
    if (responder) {
        // Respond appropriately
        responder(req, res);
        return;
    }

    // Return a 404 if no responder was found
    responders["404"](req, res);
}).listen(1337);
