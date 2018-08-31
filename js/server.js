/*eslint no-console: 0, no-unused-vars: 0, no-undef:0*/
/*eslint-env node, es6 */

"use strict";
let server = require("http").createServer();
let port = process.env.PORT || 3000;

//server.globalAgent.options.ca = xsenv.loadCertificates();

global.__base = __dirname + "/";

//Create Socket Server
let io = require("socket.io")(server, {
	"path": "/node/geospatial"
});

//Load HANA Options and create the Connection Pool within the Socket Server
let hdb = require("@sap/hdbext");
let xsenv = require("@sap/xsenv");
let hanaOptions = xsenv.getServices({
	hana: {
		tag: "hana"
	}
});
io.pool = hdb.getPool(hanaOptions.hana);

//Start the HTTP Server 
server.listen(port, function () {
	console.info(`HTTP Server: ${server.address().port}`);
});

//Handle Socket Events
io.on("connection", (socket) => {
	console.log("Socket Connected");
	io.pool.acquire(null, async(error, client) => {
		if (error) {
			console.log(`HDB Connection Error: ${error.toString()}`);
			return;
		}
		socket.hdb = client;
		//Get Points
		socket.on("getPts", (type, cb) => {
			require("./events/getPts")(socket, type, cb);
		});

		//Get Clusters
		socket.on("getClusters", (options, cb) => {
			require("./events/getClusters")(socket, options, cb);
		});

		//Travel Agency Name Search
		socket.on("travelAgencyNameSearch", (input, cb) => {
			require("./events/travelAgencyNameSearch")(socket, input, cb);
		});

		//Polygon Drawn
		socket.on("polygonDrawn", (polygonCoord, cb) => {
			require("./events/polygonDrawn")(socket, polygonCoord, cb);
		});

		socket.on("disconnect", () => {
			io.pool.release(socket.hdb);
			console.log("Socket Disconnected");
		});
		socket.emit("Connected to server!");
	});
});