var baseicon = L.Icon.extend({
    options: {
		className: 'asdf',
		iconSize: [40,47],
		iconAnchor: [20, 47]
    }
});

var IsoControl = L.Control.extend({
  options: {
		scenarios: {},
		scenario1: null,
		scenario2: null,
    indicator1: null, // argh. quick workaround.
    indicator2: null, 
    position: 'topright',
		time: 2700,
    colors: ["#2188e0", "#ff931f"],
    isochrone1_style: {color:"#2188e0", weight:3, opacity: 1.0, fillOpacity: 0.3},
    isochrone2_style: {color:"#ff931f", weight:3, opacity: 1.0, fillOpacity: 0.3, dashArray:'3,6'}
  },

  onAdd: function (leafletmap) {
		this.layermarker = new L.LayerGroup().addTo(leafletmap);
		this.layerroutes = new L.LayerGroup().addTo(leafletmap);
		this.layer1 = new L.LayerGroup().addTo(leafletmap); 
		this.layer2 = new L.LayerGroup().addTo(leafletmap);
    
    var container = L.DomUtil.create('div');
		var c = $('<div class="transvisor-control" />');
    this.c = c;
		var self = this;
	
    // Scenario selector
    $('<div />').text('Scenario 1:').appendTo(c)
		$('<select name="scenario1" />')
			.append(SCENARIOS.map(function(i){return $('<option />').data('scenario', i).val(i.id).text(i.name)}))
			.val(this.options.scenario1)
			.change(function(e) {self.reload()})
			.appendTo(c);
      
    $('<div />').text('Scenario 2:').appendTo(c)      
		$('<select name="scenario2" />')
			.append(SCENARIOS.map(function(i){return $('<option />').data('scenario', i).val(i.id).text(i.name)}))
			.val(this.options.scenario2)
			.change(function(e) {self.reload()})
			.appendTo(c);		
					
		// Stop selector
		$('<hr />').appendTo(c);
    $('<div />').text('Starting point:').appendTo(c);
    $('<select name="stop" />')
      .append(
        this.options.stops.map(function(i) {
          return $('<option />')
            .attr('value', i.stop_id)
            .text(i.stop_name)
            .data('stop', i)            
        })
      )
			.change(function() {self.reload()})
      .val(this.options.stop_initial['stop_id'])
			.appendTo(c);
			
    // Time selector
		$('<hr />').appendTo(c);
    $('<input type="range" min="0" max="5400" value="2700" step="300" name="seconds" />')
			.on('input change', function() {
				var seconds = parseInt($(this).val());
				self.isochrone_time(seconds);
				self.indicator_time(seconds);
			})
			.appendTo(c);

		$('<div />')
			.text('45 minutes')
			.addClass('transvisor-control-timelabel')
			.appendTo(c)

		// Indicators and graph
		$('<div />')
			.text('Loading indicators')
			.addClass('transvisor-control-indicators')
			.appendTo(c);
      
      // Legend
    $('<hr />').appendTo(c);
    this.legend = $('<div />').addClass('transvisor-legend').appendTo(c);
			
		// Layer control
    // $('<hr />').appendTo(c);
    //     $('<div />').text('Displayed features:').appendTo(c)
    // $('<ul />')
    //   .addClass('transvisor-control-toggle')
    //   .appendTo(c);

		// Disable click propogation.
		c.appendTo($(container));
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(container, 'mousewheel', L.DomEvent.stopPropagation);				
    return container;    
  },
  
  add_legend: function(elem) {
    this.legend.empty();
    this.legend.append(elem);
  },
  
  find_scenario: function(id) {
    // Argh.
    for (var i in this.options.scenarios) {
      if (this.options.scenarios[i].id == id) {
        return this.options.scenarios[i]
      }
    }
  },

	reload: function() {
    // Gather current settings and reload.
		this.load(
      $('select[name=scenario1] option:selected').data('scenario').id,
      $('select[name=scenario2] option:selected').data('scenario').id,
      $('select[name=stop] option:selected').data('stop')
    );
	},
	
	load: function(scenario1, scenario2, stop) {
    // Load two scenarios and a stop.
		var self = this;
    this.options.scenario1 = scenario1;
    this.options.scenario2 = scenario2;
    ///    
		var seconds = $('input[name=seconds]').val();
		this.layermarker.clearLayers();
		L.marker([stop.stop_lat, stop.stop_lon], {
			icon: new baseicon({iconUrl:'dist/images/bus_station.png'})
		}).addTo(this.layermarker);
		this.layer1.clearLayers();
		this.layer2.clearLayers();
		// Load isochrones
	    $.getJSON('cache/'+scenario1+'.'+stop.stop_id+'.isochrones.geojson', 
			function(isochrones1) {
			    $.getJSON('cache/'+scenario2+'.'+stop.stop_id+'.isochrones.geojson', 
					function(isochrones2) {
            self.isochrone_draw(self.layer1, isochrones1, self.options.isochrone1_style);
            self.isochrone_draw(self.layer2, isochrones2, self.options.isochrone2_style);
						self.isochrone_time(seconds);
					}
				);
			}
		);			
		// Load indicators
	    $.getJSON('cache/'+scenario1+'.'+stop.stop_id+'.indicators.json', 
			function(indicator1) {
			    $.getJSON('cache/'+scenario2+'.'+stop.stop_id+'.indicators.json', 
					function(indicator2) {
            // Argh.
            indicator1.name = self.find_scenario(scenario1).name;
            indicator2.name = self.find_scenario(scenario2).name;
            self.options.indicator1 = indicator1;
            self.options.indicator2 = indicator2;
						self.indicator_time(seconds);					
					}
				);
			}
		);
	},

  load_geojson: function(uri, label, style, icon) {
    var self = this;
    var style = style || {};
    // var icon = icon || 'test.png';
    if (icon) {
      style.pointToLayer = function(feature,latlon) {return L.marker(latlon, {icon: new baseicon({className: 'gtfs-jobs', iconUrl:icon})})} 
      style.onEachFeature = function(feature, layer) {layer.bindPopup(feature.properties.name)}     
    }
		$.getJSON(uri, function(data) {
      var layer = new L.geoJson(data, style).addTo(self.layerroutes);    
      $('<li />')
        .data('state', true)
        .click(function(e) {
          e.preventDefault();
          var elem = $(e.delegateTarget)
          var state = elem.data('state');
          elem.data('state', !state)
          $('input:checkbox', elem).prop('checked', !state);
          if (state) {
            layer.setStyle({'opacity':0.0})
          } else {
            layer.setStyle(style);
          }
        })
        .append($('<input type="checkbox" />').attr('checked', 'checked'))
        .append($('<span />').text(label))
        .appendTo($('.transvisor-control-toggle'))
    });
  },

	isochrone_time: function(seconds) {
		// Redraw isochrone
		$('.transvisor-control-timelabel').text((seconds/60) + ' minutes');
		$('.isochrone').hide();
		$('.isochrone-'+seconds).show();
	},

	isochrone_draw: function(layer, isochrones, style) {
		// Redraw isochrones
    layer.clearLayers();
    for (var isochrone in isochrones.features) {
    	isochrone = isochrones.features[isochrone];
		var time = isochrone.properties['Time'];
		style['className'] = 'isochrone isochrone-'+time;
		var isochronelayer = new L.geoJson(isochrone, style).addTo(layer);
		$('.isochrone-'+time).hide();
		}
	},

	indicator_time: function(seconds) {
    // Calculate sum of indicated value
    function indicator_sum(indicator, key, seconds) {
      var sum = 0;
      for (var i=0; i<Math.ceil(seconds/60); i++) {
        sum += indicator['data'][key]['sums'][i];
      }
      return sum
    }

    var elem = $('.transvisor-control-indicators');
    elem.empty();

    ///////////////////
    var ind = [this.options.indicator1, this.options.indicator2]; 
    var labels = {'census:pop':'Population', 'census:jobs':'Jobs'}
    var keys = {};
    var cats = {};
    ind.map(function(i) {   
      keys[i.name] = 1;
      Object.keys(i.data).map(function(k){
        cats[k] = 1;
      })
    });
    keys = Object.keys(keys);
    cats = Object.keys(cats);
    var data = cats.map(function(k) {
      var d = {}
      d.key = k;
      d.label = labels[k];
      d.data = ind.map(function(i) {
        return {name:i.name, key:k, value:indicator_sum(i,k,seconds), max:indicator_sum(i,k,seconds), label:labels[k]};
      });
      return d
    });
    var cats = ['Population', 'Jobs'];
    
    //////////////////////////////////
    var margin = {
        top: 70, 
        right: 20, 
        bottom: 40, 
        left: 70};
        
    var width = elem.width() - margin.left - margin.right;

    var height = 400 - margin.top - margin.bottom;

    var x0 = d3.scale.ordinal()
        .rangeRoundBands([0, width], .1);

    var x1 = d3.scale.ordinal();

    var y = d3.scale.linear()
        .range([height, 0]);

    var color = d3.scale.ordinal()
        .range(this.options.colors);

    var xAxis = d3.svg.axis()
        .scale(x0)
        .orient("bottom");

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left")
        .tickFormat(d3.format(".2s"));

    var svg = d3.select(elem[0]).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    x0.domain(cats);
    x1.domain(keys).rangeRoundBands([0, x0.rangeBand()]);
    y.domain([0, d3.max(data, function(d) { return d3.max(d.data, function(d) { return d.max; }); })]);
    
    svg.append("g")
          .attr("class", "x axis")
          .attr("transform", "translate(0," + height + ")")
          .call(xAxis);

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);
        
    var state = svg.selectAll(".state")
        .data(data)
      .enter().append("g")
        .attr("class", "g")
        .attr("transform", function(d) {return "translate(" + x0(d.label) + ",0)"});

    state.selectAll("rect")
        .data(function(d) {return d.data}).enter()
      .append("rect")
        .attr("width", x1.rangeBand())
        .attr("x", function(d) { return x1(d.name); })
        .attr("y", function(d) { return y(d.value); })
        .attr("height", function(d) { return height - y(d.value) })
        .style("fill", function(d) { return color(d.name) });
    
    state.selectAll("text")
        .data(function(d){return d.data}).enter()
        .append("text")
        .attr("x", function(d) {return x1(d.name)})
        .attr("y", function(d) {return y(d.value)})
        .attr("dx", 10)
        .attr("dy", 20)
        .text(function(d) {return Math.floor(d.value/1000)+"k"});
          
    // Subtract 50px to put into top margin.
    var legend = svg.selectAll(".legend")
        .data(keys)
      .enter().append("g")
        .attr("class", "legend")
        .attr("transform", function(d, i) { return "translate(0," + ((i * 25)-60) + ")"; });        

    legend.append("rect")
        .attr("x", width - 22)
        .attr("width", 22)
        .attr("height", 22)
        .style("fill", color);

    legend.append("text")
        .attr("x", width - 27)
        .attr("y", 11)
        .attr("dy", ".35em")
        .style("text-anchor", "end")
        .text(function(d) {return d});
	}
});