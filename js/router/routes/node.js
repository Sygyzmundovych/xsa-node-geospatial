/*eslint no-console: 0, no-unused-vars: 0, no-shadow: 0, new-cap: 0*/
/*eslint-env node, es6 */
"use strict";
var express = require("express");
//var WebSocketServer = require("ws").Server;

module.exports = function (server) {
	var app = express.Router();

	//Hello Router
	app.get("/", (req, res) => {
		res.send("Welcome to SAP HANA Spatial Demo with Node.js and XSA!");
	});

	var io = require("socket.io")(server, {
		"path": "/node/geospatial"
	});
	io.on("connection", (socket) => {
		console.log("Connected");
		socket.emit("Connected to server!");
		var hdb = require("@sap/hdbext");
		var xsenv = require("@sap/xsenv");
		var hanaOptions = xsenv.getServices({
			hana: {
				tag: "hana"
			}
		});
		socket.pool = hdb.getPool(hanaOptions.hana);

		//Get Points
		socket.on("getPts", (type, cb) => {
			console.log("getPts Event");
			switch (type) {
			case "travelAgents":
				const query =
					`SELECT "NAME", "STREET", "CITY", "COUNTRY",
				                 "LOC_4326".ST_X() AS LONGITUDE,
				                 "LOC_4326".ST_Y() AS LATITUDE
				                 FROM V_STRAVELAG`;
				socket.pool.acquire(null, async(error, client) => {
					try {
						const dbClass = require(global.__base + "utils/dbPromises");
						let db = new dbClass(client);
						const statement = await db.preparePromisified(query);
						const results = await db.statementExecPromisified(statement, []);
						let body = [];
						for (let item of results) {
							body.push({
								"Name": item.NAME,
								"Address": `${item.STREET}, ${item.CITY}, ${item.COUNTRY}`,
								"Longitude": item.LONGITUDE,
								"Latitude": item.LATITUDE
							});
						}
						cb(body);
					} catch (e) {
						console.log(`Get Agent Points ERROR: ${e.toString()}`);
						cb("error");
					}
				});
				break;
			case "airports":
				const query2 =
					`SELECT "NAME", "MUNICIPALITY", "ISO_COUNTRY",
				                 LONGITUDE,
				                 LATITUDE
				                 FROM V_SAIRPORTS`;
				socket.pool.acquire(null, async(error, client) => {
					try {
						const dbClass = require(global.__base + "utils/dbPromises");
						let db = new dbClass(client);
						const statement = await db.preparePromisified(query2);
						const results = await db.statementExecPromisified(statement, []);
						let body = [];
						for (let item of results) {
							body.push({
								"Name": item.NAME,
								"Address": `${item.MUNICIPALITY}, ${item.ISO_COUNTRY}`,
								"Longitude": item.LONGITUDE,
								"Latitude": item.LATITUDE
							});
						}
						cb(body);
					} catch (e) {
						console.log(`Get Airport Points ERROR: ${e.toString()}`);
						cb("error");
					}
				});
				break;
			default:
				cb("error");
			}
			return;
		});

		//Get Clusters
		socket.on("getClusters", (options, cb) => {
			var query = "";
			let tableName = "";
			switch (options.type) {
			case "travelAgents":
				tableName = "V_STRAVELAG";
				break;
			case "airports":
				tableName = "V_SAIRPORTS";
				break;
			default:
				cb("error");
			}
			const clusterQuery =
				`SELECT ST_ClusterID() AS CID,
				        COUNT(*) AS COUNT,
				        ST_ClusterCentroid().ST_X() AS CENTER_LNG,
				        ST_ClusterCentroid().ST_Y() AS CENTER_LAT
				   FROM (
					SELECT LOC_4326.ST_Transform(1000004326) AS OBJ_LOCATION
					  FROM ${tableName}
					 WHERE LOC_4326 IS NOT NULL
				   )
				   GROUP CLUSTER BY OBJ_LOCATION
				   USING KMEANS CLUSTERS ?`;
			socket.pool.acquire(null, async(error, client) => {
				try {
					const dbClass = require(global.__base + "utils/dbPromises");
					let db = new dbClass(client);
					const statement = await db.preparePromisified(clusterQuery);
					const results = await db.statementExecPromisified(statement, [options.number.toString()]);
					let body = [];
					for (let item of results) {
						body.push({
							"ClusterID": item.CID,
							"Count": item.COUNT,
							"Longitude": item.CENTER_LNG,
							"Latitude": item.CENTER_LAT
						});
					}
					cb(body);
				} catch (e) {
					console.log(`Get Clusters ERROR: ${e.toString()}`);
					console.log(clusterQuery);
					cb("error");
				}
			});
		});

		//Travel Agency Name Search
		socket.on("travelAgencyNameSearch", (input, cb) => {
			const nameQuery =
				`SELECT NAME, AGENCYNUM, LOC_4326.ST_X() AS LNG, LOC_4326.ST_Y() as LAT
			                     FROM V_STRAVELAG
			                    WHERE CONTAINS(NAME, ?, FUZZY(0.7))`;
			let params = `%${input}%`;
			const salesQuery =
				`SELECT SALE_DATE, SUM(TOTAL_PRICE) AS TOTAL_PRICE
			                      FROM STRANSACTIONS
			                     WHERE AGENCYNUM IN (?)
			                       AND SALE_DATE > ADD_DAYS(CURRENT_DATE, -28)
			                     GROUP BY SALE_DATE
			                     ORDER BY SALE_DATE ASC`;
			var airportQuery = "";
			socket.pool.acquire(null, async(error, client) => {
				try {
					const dbClass = require(global.__base + "utils/dbPromises");
					let db = new dbClass(client);
					const statement = await db.preparePromisified(nameQuery);
					const results = await db.statementExecPromisified(statement, [params]);
					let name = results[0].NAME;
					let lng = results[0].LNG;
					let lat = results[0].LAT;

					const salesStatement = await db.preparePromisified(salesQuery);
					const salesResults = await db.statementExecPromisified(salesStatement, [results[0].AGENCYNUM]);
					let x = [];
					let y = [];
					for (let item of salesResults) {
						x.push(item.SALE_DATE);
						y.push(item.TOTAL_PRICE);
					}
					let salesResponse = {
						"x": x,
						"y": y
					};

					airportQuery =
						`SELECT TOP 1 LOC_4326.ST_Distance(
				                    ST_GeomFromText('POINT(${lng} ${lat})', 4326), 'kilometer')
				                    AS DISTANCE, NAME
				                    FROM V_SAIRPORTS ORDER BY Distance ASC`;

					const airportStatement = await db.preparePromisified(airportQuery);
					const airportResults = await db.statementExecPromisified(airportStatement, []);
					let distanceReponse = {
						"Name": airportResults[0].NAME,
						"Distance": airportResults[0].DISTANCE
					};
					let response = [name, salesResponse, distanceReponse];
					cb(response);
				} catch (e) {
					console.log(`travelAgencyNameSearch ERROR: ${e.toString()}`);
					console.log(salesQuery);
					cb("error");
				}
			});
		});

		//Polygon Drawn
		socket.on("polygonDrawn", (data, cb) => {

		});

	});

	return app;
};