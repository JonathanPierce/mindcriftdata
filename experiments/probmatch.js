Processors.register("ProbMatch", {
    globalStats: function(data) {
        var left = 0;
        var total = 0;

        data.map(function(entry) {
            var instance = entry.data;
            for(var i = 0; i < instance.length; i++) {
                if(instance[i].event === "ButtonPress") {
                    total += 1;

                    if(instance[i].args.left) {
                        left += 1;
                    }
                }
            }
        });

        return [
            {
                name: "Button Presses",
                value: total
            },
            {
                name: "% Left",
                value: ((left / total) * 100) + "%"
            }
        ];
    },
    instanceStats: function(instance) {
        var left = 0;
        var total = 0;

        for(var i = 0; i < instance.length; i++) {
            if(instance[i].event === "ButtonPress") {
                total += 1;

                if(instance[i].args.left) {
                    left += 1;
                }
            }
        }

        return [
            {
                name: "Button Presses",
                value: total
            },
            {
                name: "% Left",
                value: ((left / total) * 100) + "%"
            }
        ];
    }
});

console.log("Processing script for ProbMatch completed!");
