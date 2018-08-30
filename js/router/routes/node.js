/*eslint no-console: 0, no-unused-vars: 0, no-shadow: 0, new-cap: 0*/
/*eslint-env node, es6 */
"use strict";
var express = require("express");
var async = require("async");

module.exports = function () {
	var app = express.Router();

	function getLatLong(addr) {
		try {
			const http = require("http");
			const key = "AIzaSyAp7Ad6nKFet8XBxYYh4TWFVAa3cpSMmR0";
			const url = "https://maps.googleapis.com/maps/api/geocode/json";
			let body = "";
			http.get({
					path: `${url}?address=${addr}&key=${key}`,
					host: "maps.googleapis.com",
					port: "80",
					headers: {
						host: "maps.googleapis.com"
					}
				},
				function (response) {
					response.setEncoding("utf8");
					response.on("data", (chunk) => {
						body += chunk;
					});
					response.on("error", (error) => {
						console.log(`Error: ${error.toString()}`);
					});
					response.on("end", () => {
						const details = JSON.parse(body);

						let lat = details.results[0].geometry.location.lat;
						let lng = details.results[0].geometry.location.lng;
						return [lat, lng];
					});
				});
		} catch (err) {
			console.log(`Error: ${err.toString()}`);
		}
	}

	//Hello Router
	app.get("/", (req, res) => {
		res.send("Welcome to SAP HANA Spatial Demo with Node.js and XSA!");
	});

	//Geocode
	app.get("/geocode/:type?", async(req, res) => {
		const type = req.params.type;
		var query = "";
		let tableName = "";
		switch (type) {
		case "agencies":
			tableName = "STRAVELAG";
			query = `SELECT "AGENCYNUM" AS "ID", "NAME", "STREET", "CITY", "COUNTRY", "POSTCODE" FROM ${tableName}`;
			break;
		case "airports":
			tableName = "SAIRPORTS";
			query = `SELECT "ID", "NAME", "LONGITUDE", "LATITUDE" FROM ${tableName}`;
			break;
		default:
			return res.type("text/plain").status(500).send(`ERROR: Invalid Parameter Value for Type: ${type}`);
		}
		var output = "";
		try {
			const dbClass = require(global.__base + "utils/dbPromises");
			let db = new dbClass(req.db);
			const statement = await db.preparePromisified(query);
			const results = await db.statementExecPromisified(statement, []);
			for (let item of results) {
				let name = "";
				let addr = "";
				let lat = null;
				let lng = null;
				let id = null;
				let query2 = "";
				switch (type){
					case "agencies":
						name = item.NAME;
						id = item.ID;
						addr = `${item.STREET}, ${item.CITY}, ${item.COUNTRY}, ${item.POSTCODE}`;
						const latLong = getLatLong(addr);
						lat = latLong[0];
						lng = latLong[1];
						query2 = `UPDATE ${tableName} 
								     SET "LOC_4326" = ST_GeomFromText('POINT(?,?)', 4326)
								   WHERE "AGENCYNUM" = ?`;
						break;
					case "airports":
						name = item.NAME;
						lng = item.LONGITUDE;
						lat = item.LATITUDE;
						id = item.ID;
						query2 = `UPDATE ${tableName} 
									 SET "LOC_4326" = ST_GeomFromText('POINT(?,?)', 4326)
								   WHERE "ID" = ?`;
						break;
				}
				
				//Save to DB
				console.log(`Query: ${query2} Key: ${id}, ${lng}, ${lat}`);
				const statement2 = await db.preparePromisified(query2);
				//name = name.replace("'", "''");
				const results2 = await db.statementExecPromisified(statement, [lng, lat, id]);
				output += `Place: ${name}, Latitude: ${lat}, Longitude: ${lng}\n`;
			}
			
			return res.type("text/html").status(200).send(output);
		} catch (e) {
			return res.type("text/plain").status(500).send(`ERROR: ${e.toString()}`);
		}
	});

	return app;
};