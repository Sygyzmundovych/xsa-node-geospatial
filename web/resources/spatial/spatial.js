require([
	"esri/Map",
	"esri/views/MapView",
	"dojo/domReady!",
	"esri/views/2d/draw/Draw",
	"esri/Graphic",
	"esri/geometry/Polygon",
	"esri/geometry/support/webMercatorUtils",
	"esri/geometry/Point",
	"esri/layers/GraphicsLayer",
	"esri/renderers/HeatmapRenderer",
    "esri/config",
	"esri/layers/CSVLayer"
], function (
	Map,
	MapView,
	domready,
	Draw,
	Graphic,
	Polygon,
	webMercatorUtils,
	Point,
	GraphicsLayer,
	HeatmapRenderer,
	esriConfig,
	CSVLayer
) {
	//create map obj with srid 4326
	var map = new Map({
		basemap: "osm",
		spatialReference: 4326
	});

	//create MapView centerd at Europe
	var view = new MapView({
		container: "viewDiv",
		map: map,
		zoom: 5,
		center: [15.2551, 54.5260], //center of europe
		padding: {
			left: 400
		} //for side panel
	});

	view.on("double-click", (e) => {
		console.log(view.zoom);
	});
	view.on("mouse-wheel", (e) => {
		console.log(view.zoom);
	});

	//start websocket connection
	var globalSocket;
	var websocketPromise = new Promise((resolve, reject) => { 
		var socket = io.connect("", {path: "/node/geospatial"});
	//	var socket = io.connect("wss://6clfdaj5icdrd1kbde-geospatial-web.hanapm.local.com:30033/node/geospatial");
		socket.on('open', resolve(socket));
		socket.on('error', reject());
	});

	websocketPromise.then((socket) => {
		globalSocket = socket;
		socket.on('message', e => {
			console.log('Received from server: ' + e);
		});
		socket.on('error', e => {
			console.log('Error from websocket: ' + e);
			closeWebsocket();
		});
		function closeWebsocket() {
			if (socket && socket.readyState === socket.OPEN) socket.close();
		}
	});

	
	var clusterLayer, airportPoints, agencyPoints, heatMapLayer, showTravelAgentsBtn;		
	//needed for zoom + clearing screen

	//draw polygon button for user polygon input
	view.ui.add("draw-polygon", "top-left");
	//var pointGraphics = [];
	view.when(function (event) {
		var graphic;
		var draw = new Draw({
			view: view
		});

		//create polygon when map area clicked
		var drawPolygonButton = document.getElementById("draw-polygon");
		drawPolygonButton.addEventListener("click", function () {	
			map.remove(clusterLayer);
			map.remove(heatMapLayer);
			showTravelAgentsBtn.click();
			
			view.graphics.remove(graphic);
			enableCreatePolygon(draw, view);
		});

		//event handlers for creating polygon
		function enableCreatePolygon(draw, view) {
			var action = draw.create("polygon");
			view.focus();
			action.on("vertex-add", drawPolygon);
			action.on("cursor-update", drawPolygon);
			action.on("draw-complete", doneDrawingPolygon);
		}

		//draw polygon on map - main function
		function drawPolygon(event) {
			view.graphics.remove(graphic);

			var polygon = createPolygon(event.vertices);
			graphic = createGraphic(polygon);

			view.graphics.add(graphic);
		}
	
		//create polygon with given vertices
		function createPolygon(vertices) {
			return new Polygon({
				rings: vertices,
				spatialReference: view.spatialReference
			});
		}

		//show polygon on map
		function createGraphic(polygon) {
			graphic = new Graphic({
				geometry: polygon,
				symbol: {
					type: "simple-fill",
					color: [178, 102, 234, 0.8],
					style: "solid",
					outline: {
						color: [0, 0, 0],
						width: 2
					}
				}
			});
			return graphic;
		}

		//use polygon
		function doneDrawingPolygon(event){
			//focus on area
			
			//get coordinates
			vertices = event.vertices;
			polygonCoord = [];
			for (var i = 0; i < vertices.length; i++) {
				polygonCoord.push(webMercatorUtils.xyToLngLat(
					vertices[i][0], vertices[i][1]
				));
			}
			//send to Python
			polygonCoord.push(polygonCoord[0]);		//required for HANA
			globalSocket.emit('polygonDrawn', polygonCoord, response => {
				console.log(response);

				//show selected
				var selectedHTML = document.getElementById('selected');
				selectedHTML.style.height = 'auto';
				var ul = document.createElement('ul');
				for (var i = 0; i < response[0].length; i++) {
					var li = document.createElement('li');
					li.innerHTML = response[0][i].Name;
					ul.appendChild(li)
				}
				selectedHTML.innerHTML = '<h3>Selected Agencies:</h3>';
				selectedHTML.appendChild(ul);
				selectedHTML.style.visibility = 'visible';

				//show graph
				var trace = {
					x: response[1].x,
					y: response[1].y,
					type: 'scatter',
					name: "Total Sales for August in CAD"
				}
				var layout = {
					title: 'Total Sales for August in CAD',
					xaxis: {
					  title: 'Date'
					},
					yaxis: {
					  title: 'Revenue ($)'
					}
				  };
				Plotly.newPlot('graph', [trace], layout);
				var graphHTML = document.getElementById('graph');
				graphHTML.style.visibility = 'visible';
				var distanceHTML = document.getElementById('distance');
				distanceHTML.style.visibility = 'hidden';
			});
		}
	});

	//search
	var searchSubmitBtn = document.getElementById('searchSubmit');
	var searchField = document.getElementById('searchField');
	
	searchField.addEventListener("keyup", event => {
		if (event.key !== "Enter") return;
		searchSubmitBtn.click();
		event.preventDefault();
	});
	searchSubmitBtn.addEventListener("click", () => {
		searchInput = searchField.value;
		if (view.graphics.length < 1) showTravelAgents();
		searchZoom(searchInput);		//zoom in on respective point
	}); 

	function searchZoom(input) {
		globalSocket.emit('travelAgencyNameSearch', input, response => {
			if (response !== "error") name = response[0];
			refreshPanel();
			//show graph
			var trace = {
				x: response[1].x,
				y: response[1].y,
				type: 'scatter',
				name: "Total Sales for August in CAD"
			}
			var layout = {
				title: 'Total Sales for August in CAD',
				xaxis: {
				  title: 'Date'
				},
				yaxis: {
				  title: 'Revenue ($)'
				}
			  };
			Plotly.newPlot('graph', [trace], layout);
			var graphHTML = document.getElementById('graph');
			graphHTML.style.visibility = 'visible';			
			
			var distanceHTML = document.getElementById('distance');
			var distanceText = '<p><strong>Closest airport:</strong> ' 
								  +  response[2].Name + ' at a distance of: ' 
								  + response[2].Distance.toFixed(2) + ' km.</p>';
			distanceHTML.innerHTML = distanceText;
			distanceHTML.style.visibility = 'visible';
			zoomIn(name);
		});
	}

	//for zooming in on the clicked point
	view.on("click", function (event) {
		event.stopPropagation();	//required
		view.hitTest(event).then(function (response) {
			if (response.results.length === 1) { // might cause problems later... we'll see
				var g = response.results[0].graphic;
				zoomIn(g);
			}
		});
	});

	//actual zoom in function
	function zoomIn(input) {
		var pointGraphics = [];
		for (var i = 0; i < map.layers.items.length; i++) {
			pointGraphics = pointGraphics.concat(map.layers.items[i].graphics.items);
		}
		for (var i = 0; i < pointGraphics.length; i++) {
			if (pointGraphics[i].attributes.Name === input || 
					input === pointGraphics[i]
			) {
				target = {
					target: pointGraphics[i],
					zoom: 30
				}
				options = {
					animate: true,
					duration: 1500,
					easing: 'linear'
				}
				view.goTo(target, options).then(() => {
					var title = target.target.attributes.Name;
					var addr = target.target.attributes.Address;
					view.popup.open({
						title: title,
						location: {
							longitude: view.center.longitude, 
							latitude: view.center.latitude + 0.00002
						},
						content: addr
					});
				});
				break;
			}
		}
	}

	//for plotting travel agencies
	showTravelAgentsBtn = document.getElementById('showTravelAgentsBtn');
	showTravelAgentsBtn.addEventListener("click", showTravelAgents);
	function showTravelAgents() {
		globalSocket.emit('getPts', "travelAgents", pts => {
			if (pts !== "error") {
				var ptSymbol = {
					type: "picture-marker",
					url: "images/marker.png",
					width: 20,
					height: 20
				}
				agencyPoints = makePointsList(pts, ptSymbol)
				var agencyPtsLayer = new GraphicsLayer({
					graphics: agencyPoints
				});
				refreshPanel();
				map.remove(clusterLayer);
				map.remove(heatMapLayer);
				map.add(agencyPtsLayer);
			}
		});
	}

	//for plotting major airports
	var showAirportsBtn = document.getElementById('showAirportsBtn');
	showAirportsBtn.addEventListener("click", showAirports);
	function showAirports() {
		globalSocket.emit('getPts', 'airports', pts => {
			if (pts !== "error") {
				var ptSymbol = {
					type: "picture-marker",
					url: "images/airport_marker.png",
					width: 20,
					height: 20
				}
				airportPoints = makePointsList(pts, ptSymbol)
				var airportPtsLayer = new GraphicsLayer({
					graphics: airportPoints
				});
				refreshPanel();
				map.remove(clusterLayer);
				map.remove(heatMapLayer);
				map.add(airportPtsLayer);
			}
		});
	}

	//for plotting clusters
	var agencyClustersBtn = document.getElementById('showAgencyClustersBtn');
	agencyClustersBtn.addEventListener("click", () => {
		options = {
			type: 'travelAgents',
			number: view.zoom + 5
		}
		globalSocket.emit('getClusters', options, pts => {
			if (pts !== "error") {
				clusterPoints = makePointsList(pts, null, true)
				clusterLayer = new GraphicsLayer({
					graphics: clusterPoints
				});
				refreshPanel();
				map.removeAll();
				map.add(clusterLayer);
			}
		});
	});

	var airportClustersBtn = document.getElementById('showAirportClustersBtn');
	airportClustersBtn.addEventListener("click", () => {
		options = {
			type: 'airports',
			number: view.zoom + 8
		}
		globalSocket.emit('getClusters', options, pts => {
			if (pts !== "error") {
				clusterPoints = makePointsList(pts, null, true)
				clusterLayer = new GraphicsLayer({
					graphics: clusterPoints
				});
				refreshPanel();
				map.removeAll();
				map.add(clusterLayer);
			}
		});
	});

	//heatmap
	var baseURL = "https://raw.githubusercontent.com/subhanaltaf/xsa-python-geospatial/master/db/src/data/loads/"
	var agencyHeatMapBtn = document.getElementById('showAgencyHeatMapBtn');
	agencyHeatMapBtn.addEventListener("click", () => {
		url = baseURL + "travel_agencies_latlng.csv";
		esriConfig.request.corsEnabledServers.push(url);

		const renderer = {
        	type: "heatmap",
        	colorStops: [
				{ color: "rgba(0, 64, 255, 0)", ratio: 0 },
				{ color: "#0044ff", ratio: 0.25 },
				{ color: "#00ff00", ratio: 1 }],
			maxPixelIntensity: 25,
			minPixelIntensity: 0
    	};

	  	heatMapLayer = new CSVLayer({
        	url: url,
        	title: "Travel Agencies",
			latitudeField: "LAT",
			longitudeField: "LNG",
        	renderer: renderer
		});

		refreshPanel();  
	  	map.removeAll();
		map.add(heatMapLayer);
	});

	var airportHeatMapBtn = document.getElementById('showAirportHeatMapBtn');
	airportHeatMapBtn.addEventListener("click", () => {
		url = baseURL + "airports.csv";
		esriConfig.request.corsEnabledServers.push(url);

		const renderer = {
        	type: "heatmap",
        	colorStops: [
				{ color: "rgba(0, 64, 255, 0)", ratio: 0 },
				{ color: "#0044ff", ratio: 0.25 },
				{ color: "#00ff00", ratio: 1 }],
			maxPixelIntensity: 25,
			minPixelIntensity: 0
    	};

	  	heatMapLayer = new CSVLayer({
        	url: url,
        	title: "Major Airports",
			latitudeField: "LATITUDE",
			longitudeField: "LONGITUDE",
        	renderer: renderer
		});
		  
	  	map.removeAll();
		map.add(heatMapLayer);
	});

	//prepare list of points to show on map
	function makePointsList(points, symbol, cluster=false) {
		var pointGraphics = []
		if (cluster) {
			for (var i = 0; i < points.length; i++) {
				var count = points[i].Count;
				var source = count > 5 ? "images/cluster_marker_red.png" : "images/cluster_marker_yellow.png";
				var ptSymbol = {
					type: "picture-marker",
					url: source,
					width: "30px",
					height: "30px"	
				}
				var textSymbol = {
					type: "text", 
					color: "black", 
					text: count,
					verticalAlignment: "middle"
				}
				/*var pt = {
					type: 'point',
					longitude: points[i].Longitude,
					latitude: points[i].Latitude,
					spatialReference: {wkid: 4326}
				}*/
				var pt = new Point(points[i].Longitude, points[i].Latitude, 4326);
				var attr = {
					ClusterID: points[i].ClusterID
				}
				var textGraphic = new Graphic(pt, textSymbol, attr);
				var picGraphic = new Graphic(pt, ptSymbol, attr);
				pointGraphics.push(picGraphic);
				pointGraphics.push(textGraphic);
			}
		} else {
			for (var i = 0; i < points.length; i++) {
				var pt = new Point(points[i].Longitude, points[i].Latitude, 4326);
				/*var pt = {
					type: 'point',
					longitude: points[i].Longitude,
					latitude: points[i].Latitude,
					spatialReference: {wkid: 4326}
				}*/
				var attr = {
					Name: points[i].Name,
					Address: points[i].Address
				}
				var graphic = new Graphic(pt, symbol, attr);
				pointGraphics.push(graphic);		
			}
		}
		return pointGraphics;
	}
	function refreshPanel(){
		var distanceHTML = document.getElementById('distance');
		distanceHTML.style.visibility = 'hidden';
		var graphHTML = document.getElementById('graph');
		graphHTML.style.visibility = 'hidden';
		var selectedHTML = document.getElementById('selected');
		selectedHTML.style.visibility = 'hidden';
		selectedHTML.style.height = '5%';
	}
});
