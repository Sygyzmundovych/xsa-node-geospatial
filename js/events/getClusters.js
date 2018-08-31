/*eslint no-console: 0, no-unused-vars: 0, no-shadow: 0, new-cap: 0*/
/*eslint-env node, es6 */
"use strict";
module.exports = async(socket, options, cb) => {
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

	try {
		const dbClass = require(global.__base + "utils/dbPromises");
		let db = new dbClass(socket.hdb);
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

	return;
};