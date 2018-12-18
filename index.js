/*
  This utility will convert the nested data structure
  returned from an ElasticSearch query into a tabular
  data structure represented as an array of row objects.
*/
function tabify(response, options) {
    var table;
    if (typeof (options) === 'undefined') {
        options = {
            debug: false
        }
    }

    if (response.aggregations) {
        tree = collectBucket(response.aggregations);
        table = flatten(tree);

    } else if (response.hits) {
        s = function(d){return d.source}
        table = response.hits.map(s)

    } else if (Array.isArray(response)) {
        table = response;

    } else {
        throw new Error("Tabify() invoked with invalid result set. Result set must have either 'aggregations' or 'hits' defined.");
    }

    if (options.debug) {
        console.log("Results from tabify (first 3 rows only):");

        // This one shows where there are "undefined" values.
        console.log(table)

        // This one shows the full structure pretty-printed.
        console.log(JSON.stringify(table.slice(0, 3), null, 2))
    }

    return table;
}

function collectBucket(node, stack) {
    if (!stack)
        stack=[]

    if (!node)
        return;
    
    keys = Object.keys(node);
    
    // Use old school `for` so we can break control flow by returning.
    for(i = 0; i < keys.length; i++) {
        key = keys[i];
        value = node[key];
        if (typeof value === 'object' && value !== null) {
            if ("hits" in value && Array.isArray(value.hits) && value.hits.length === 1) {
                if ("sort" in value.hits[0]) {
                    value.hits[0]._source['sort'] = value.hits[0].sort[0];
                }
                return value.hits[0]._source;
            }

            if (Array.isArray(value)) {
                return extractTree(value, stack.push(key));
            }

            // Here we are sure to have an object
            if (key === "buckets" && Object.keys(value).length > 1)
            {
                return extractBuckets(value, stack.push(key));
            }

            return collectBucket(value, stack.push(key));
        }

        if (key === "value" && typeof value !== "object" && stack.length === 1) {
            t = stack[0]
            collectedObject = collectBucket({t: value});
            node = collectedObject;
        }
    }

    return node;
}

function extractBuckets(buckets, stack) {
    keys = Object.keys(buckets);
    results = [];

    for(i = 0; i < keys.length; i++) {
        key = keys[i];
        value = buckets[key];

        currentObject = collectBucket({key: value});

        if (!currentObject)
            continue;

        currentObject[stack[stack.length - 2]] = key;
        results.push(currentObject)
    }

    return results;
}

function extractTree(buckets, stack) {
    return buckets.map(function(bucket){
        return Object.keys(bucket).reduce(function (tree, key) {
            value = bucket[key];

            if (typeof value === "object") {
                if("value" in value){
                    value = value.value;
                } else {
                    value = collectBucket(value, stack.push(key));
                }
            }

            if(key === "key"){
                key = stack[stack.length - 2]
            }
            
            tree[key] = value;
        
            return tree;
        }, {});
    });
}

function flatten(tree, parentNode){

    if (!parentNode)
        parentNode={}
    
    if (!tree)
        return [];

    if (!Array.isArray(tree))
        tree = [tree];

    return tree

        // Have the child node inherit values from the parent.
        .map(function(childNode){ Object.assign({}, parentNode, childNode)})

        // Each node object here has values inherited from its parent.
        .map(function(node){

            // Detect properties whose values are arrays.
            childTrees = Object.keys(node)
                .map(function(key){
                    value = node[key];
                    if (Array.isArray(value)) {
                        return value;
                    }
                    return false;
                })
                .filter(function(d){d});

            switch (childTrees.length) {

                // Leaf node case, return the node.
                case 0:
                    return node;

                // Non-leaf node case, recurse on the child nodes.
                case 1:
                    childTree = childTrees[0];
                    if(childTree.length === 0){
                        return node;
                    }
                    return flatten(childTree, node);
                default:
                    throw new Error("This case should never happen");
            }
        })

        // Flatten the nested arrays.
            .reduce(function(a, b){a.concat(b)}, []);
}


    
