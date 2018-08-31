/*eslint no-console: 0, no-unused-vars: 0, no-shadow: 0, new-cap: 0*/
/*eslint-env node, es6 */
"use strict";
module.exports = async(socket, polygonCoord, cb) => {
	console.log("Polygon Drawn Event");
	let polygonString = "'POLYGON((";
	for (let coord of polygonCoord) {
		polygonString += coord[0].toString() + " " + coord[1].toString() + ", ";
	}
	polygonString = polygonString.substring(0, polygonString.length - 2) + "))'";

	let withinQuery =
		`SELECT LOC_4326.ST_Transform(1000004326).ST_Within(
                	ST_GeomFromText(${polygonString}, 4326).ST_Transform(1000004326)) AS WITHIN, 
            	NAME, 
            	LOC_4326.ST_X() AS LNG, 
            	LOC_4326.ST_Y() AS LAT, 
            	AGENCYNUM
          FROM V_STRAVELAG
         WHERE LOC_4326 IS NOT NULL
         ORDER BY WITHIN ASC`;
	let agencyResponse = [];
	let agencies = "";

	try {
		const dbClass = require(global.__base + "utils/dbPromises");
		let db = new dbClass(socket.hdb);
		const statement = await db.preparePromisified(withinQuery);
		const results = await db.statementExecPromisified(statement, []);
		for (let item of results) {
			if (item.WITHIN === 1) {
				agencyResponse.push({
					"Name": item.NAME,
					"Latitude": item.LAT,
					"Longitude": item.LNG
				});
				agencies += item.AGENCYNUM + ", ";
			}
		}
		agencies = agencies.substring(0, agencies.length - 2);
		let salesQuery =
			`SELECT SALE_DATE, SUM(TOTAL_PRICE) AS TOTAL_PRICE
               FROM STRANSACTIONS 
              WHERE AGENCYNUM IN (${agencies})
                AND SALE_DATE > ADD_DAYS(CURRENT_DATE, -28)
              GROUP BY SALE_DATE
              ORDER BY SALE_DATE ASC`;
		const salesStatement = await db.preparePromisified(salesQuery);
		const salesResults = await db.statementExecPromisified(salesStatement, []);
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
		let response = [agencyResponse, salesResponse];
		cb(response);
	} catch (e) {
		console.log(`Polygon Drawn ERROR: ${e.toString()}`);
		cb("error");
	}
	return;
};