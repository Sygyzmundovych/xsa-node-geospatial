/*eslint no-console: 0, no-unused-vars: 0, no-shadow: 0, new-cap: 0*/
/*eslint-env node, es6 */
"use strict";
module.exports = async(socket, input, cb) => {
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
	try {
		const dbClass = require(global.__base + "utils/dbPromises");
		let db = new dbClass(socket.hdb);
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
	return;
};