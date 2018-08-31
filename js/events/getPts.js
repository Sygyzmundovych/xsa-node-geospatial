/*eslint no-console: 0, no-unused-vars: 0, no-shadow: 0, new-cap: 0*/
/*eslint-env node, es6 */
"use strict";
module.exports = async(socket, type, cb) => {
	console.log("getPts Event");
	switch (type) {
	case "travelAgents":
		const query =
			`SELECT "NAME", "STREET", "CITY", "COUNTRY",
	                "LOC_4326".ST_X() AS LONGITUDE,
	                "LOC_4326".ST_Y() AS LATITUDE
	           FROM V_STRAVELAG`;
		try {
			const dbClass = require(global.__base + "utils/dbPromises");
			let db = new dbClass(socket.hdb);
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
		break;
	case "airports":
		const query2 =
			`SELECT "NAME", "MUNICIPALITY", "ISO_COUNTRY",
	                 LONGITUDE,
	                 LATITUDE
	           FROM V_SAIRPORTS`;
		try {
			const dbClass = require(global.__base + "utils/dbPromises");
			let db = new dbClass(socket.hdb);
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
		break;
	default:
		cb("error");
	}
	return;
};