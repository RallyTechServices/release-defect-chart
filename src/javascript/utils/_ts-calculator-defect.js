Ext.define('CA.techservices.calculator.DefectCalculator', {
    extend: 'Rally.data.lookback.calculator.TimeSeriesCalculator',
    config: {
        closedStateValues: ['Closed'],
        allowedGroupValues: [],
        groupField: 'Severity',
        /*
         * granularity: "month"|"year"|"day"|"quarter"
         */
        granularity: "day",
        /*
         * timeboxCount:  number of days/months/quarters to display back from current
         * 
         * (null to display whatever data is available)
         */
        
        timeboxCount: null,
        /*
         * colors looks like:
         * { 
         *   "High": "blue",
         *   "Pretty Low": "#00f"
         *  }
         */
        colors: {}
    },
    
    constructor: function(config) {
        this.initConfig(config);
        this.callParent(arguments);
        
        if ( Ext.isEmpty(this.granularity) ) { this.granularity = "day"; }
        this.granularity = this.granularity.toLowerCase();
        
    },

    getMetrics: function() {
        var metrics = [{
            'field': 'wasCreated',
            'as': 'Total Defects Opened',
            'f': 'sum',
            'display': 'line'
        },
        {
            'field': 'isClosed',
            'as': 'Total Defects Closed',
            'f': 'sum',
            'display': 'line'
        }];
        
        Ext.Array.each(this.allowedGroupValues, function(value){
            var value_name = "None";
            if ( !Ext.isEmpty(value) ) {
                value_name = value.replace(/[^a-zA-Z0-9]+/g,"_");
            }
            metrics.push({
                'field': 'isOpen'+value_name,
                'as': value || "None",
                'f': 'sum',
                'display': 'column',
                'stack': 1
            });
        });
        
        return metrics;
    },
    
    getDerivedFieldsOnInput: function() {
        var me = this;
        
        var derived_fields = [{ 
            as: 'wasCreated',
            f : function(snapshot) {
                return 1;
            }
        },
        {
            as: 'isClosed',
            f: function(snapshot) {
                if ( Ext.Array.contains(me.closedStateValues, snapshot.State) ) {
                    return 1;
                }
                return 0;
            }
        }];
        
        Ext.Array.each(this.allowedGroupValues, function(value){
            var value_name = "None";
            if ( !Ext.isEmpty(value) ) {
                value_name = value.replace(/[^a-zA-Z0-9]+/g,"_");
            }

            derived_fields.push({
                as: 'isOpen'+value_name,
                f: function(snapshot) {
                    if ( !Ext.Array.contains(me.closedStateValues, snapshot.State) ) {
                        if ( me._matchesValue(snapshot,value) ) { 
                            return 1;
                        }
                        return 0;
                    }
                    return 0;
                }
            });
        });
        
        return derived_fields;
    },
    
    _matchesValue: function(snapshot,value) {
        var me = this;
        
        // when hydrated, lookback will return "None" for an empty field
       // console.log(this.groupField, snapshot[this.groupField], value);
        var result = false;
        if ( ( snapshot[this.groupField] == 'None' || ! snapshot[this.groupField] ) && Ext.isEmpty(value)) {
            result = true;
        } else if (snapshot[this.groupField] == value) {
            result = true;
        }
        
        return result;
    },
    
    // override to limit number of x points displayed
    runCalculation: function (snapshots) {        
        var calculatorConfig = this._prepareCalculatorConfig(),
            seriesConfig = this._buildSeriesConfig(calculatorConfig);

        var calculator = this.prepareCalculator(calculatorConfig);
        calculator.addSnapshots(snapshots, this._getStartDate(snapshots), this._getEndDate(snapshots));

        this.snapshots = snapshots;
        
        var chart_data = this._transformLumenizeDataToHighchartsSeries(calculator, seriesConfig);
                
        var updated_chart_data = this._addColors(chart_data);
        
        //var updated_chart_data = this._addEvents(chart_data);

        //updated_chart_data = this._removeEarlyDates(updated_chart_data,this.timeboxCount);
        updated_chart_data = this._removeAfterToday(updated_chart_data);

        updated_chart_data = this._splitChartsIntoLeftAndRight(updated_chart_data);
                
        return updated_chart_data;
    },
    
    _splitChartsIntoLeftAndRight: function(data) {
        var series = data.series;
        
        Ext.Array.each(series, function(s) {
            var zindex = 1;
            yAxis = 0;
            if ( /Total/.test(s.name) ) { 
                zindex = 2;
                yAxis = 1;
            }
            s.zIndex = zindex;
            s.yAxis = yAxis;
        });
        
        return data;
    },
    
    _addColors: function(data){
        var me = this,
            series = data.series;
                
        Ext.Array.each(series, function(s) {
            var name = s.name;
            var map = me.colors[name];
           
            if ( !Ext.isEmpty(me.colors[name]) ) {
                var color = me.colors[name];
                s.color = color;
            }
        });
        
        return data;
    },
    
    _addEvents: function(data){
        var series = data.series;
                
        Ext.Array.each(series, function(s) {
            s.data = Ext.Array.map(s.data, function(datum){
                return {
                    y: datum,
                    events: {
                        click: function() {
                            Rally.getApp().showTrendDrillDown(this);
                        }
                    }
                }
            });
            
            
        });
        
        return data;
    },
    
    // override to allow for assigning granularity
    prepareCalculator: function (calculatorConfig) {
        var config = Ext.Object.merge(calculatorConfig, {
            granularity: this.granularity || this.lumenize.Time.DAY,
            tz: this.config.timeZone,
            holidays: this.config.holidays,
            workDays: this._getWorkdays()
        });

        return new this.lumenize.TimeSeriesCalculator(config);
    },
    
    _removeEarlyDates: function(chart_data,timebox_count) {
        if ( Ext.isEmpty(timebox_count) ) { return chart_data; }
        
        var categories = Ext.Array.slice(chart_data.categories, -1 * timebox_count);
        var series_group = Ext.Array.map(chart_data.series, function(series) {
            var data = Ext.Array.slice(series.data, -1 * timebox_count);
            // this format is to prevent the series from being modified:
            return Ext.Object.merge( {}, series, { data: data } );
        });
        
        
        return { 
            categories: categories, 
            series: series_group 
        };
            
    },
    
    _getQuarterStringFor: function(jsdate) {
        var month = jsdate.getMonth();
        var quarter = parseInt(month/3) + 1;
        
        return Ext.util.Format.date(jsdate,'Y') + "Q" + quarter;
    },
    
    _removeAfterToday: function(chart_data) {
        var today = new Date();
        
        var today_string = Rally.util.DateTime.toIsoString(today).replace(/T.*$/,'');
        if ( this.granularity == 'quarter' ) {
            today_string = this._getQuarterStringFor(today);
        }

        var full_categories = Ext.Array.filter(chart_data.categories, function(category){
            return ( category <= today_string );
        });
        
        var length = full_categories.length;

        var series_group = Ext.Array.map(chart_data.series, function(series) {
            var data = [];
            Ext.Array.each(series.data, function(datum,index){
                if ( index >= length ) {
                    datum = null;
                }
                data.push(datum);
            });
           
            // this format is to prevent the series from being modified:
            return Ext.Object.merge( {}, series, { data: data } );
        });
        
        
        return { 
            categories: chart_data.categories, 
            series: series_group 
        };
            
    }
});
