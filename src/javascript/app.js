Ext.define("TSReleaseDefectChart", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box', layout: 'hbox'},
        {xtype:'container',itemId:'display_box'}
    ],

    release: null,
    granularity: 'day',
    
    config: {
        defaultSettings: {
            closedStateValues: ['Closed']
        }
    },
    
    integrationHeaders : {
        name : "TSReleaseDefectChart"
    },
                        
    launch: function() {
        this._addSelectors(this.down('#selector_box'));
        
    },
    
    _addSelectors: function(container) {
        container.add({
            xtype:'rallyreleasecombobox',
            margin: 10,

            listeners: {
                scope: this,
                change: function(cb) {
                    this.release = cb.getRecord();
                    this._updateData();
                }
            }
        });
        
        var granularity_store = Ext.create('Rally.data.custom.Store',{
            data:[
                { value:'day', display: 'Day' },
                { value:'month', display: 'Month' },
                { value:'quarter', display: 'Quarter' }
            ]
        });
        
        container.add({
            xtype:'rallycombobox',
            store: granularity_store,
            displayField:'display',
            valueField:'value',
            margin: 10,
            fieldLabel: 'Timebox Granularity:',
            labelWidth: 115,
            listeners: {
                select: function(cb) {
                    this.granularity = cb.getValue();
                    this._updateData();
                },
                scope: this
            }
        });
    },
    
    _updateData: function() {
        var me = this;
        this.down('#display_box').removeAll();
        
        if ( Ext.isEmpty(this.release) || Ext.isEmpty(this.granularity) ) {
            return;
        }
        this.setLoading("Loading Release Information...");
        
        Deft.Chain.pipeline([
            this._getDefectsInRelease,
            this._makeChart
        ],this).always(function() { me.setLoading(false);});        
    },
    
    _getDefectsInRelease: function() {
        var release = this.release;
        
        var filters = Rally.data.wsapi.Filter.or([
            {property:'Release.Name', value: release.get('Name')},
            {property:'Requirement.Release.Name',value:release.get('Name')}
        ]);
        
        var config = {
            model: 'Defect',
            limit:Infinity,
            pageSize: 2000,
            filters: filters,
            fetch: ['ObjectID']
        };
        
        return this._loadWsapiRecords(config);
    },
    
    _makeChart: function(defects) {
        var deferred = Ext.create('Deft.Deferred');
        
        this.setLoading("Calculating...");
        var container = this.down('#display_box');
        
        if ( defects.length === 0 ) {
            container.add({xtype:'container',html:'No Defects in Release'});
            return;
        }
        var oids = Ext.Array.map(defects, function(defect){
            return defect.get('ObjectID');
        });
        
        var closedStates = this.getSetting('closedStateValues') || [];
        if ( !Ext.isArray(closedStates) ) { closedStates = closedStates.split(/,/); }
        
        container.add({
            xtype: 'rallychart',
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getChartStoreConfig(oids),
            
            calculatorType: 'CA.techservices.calculator.DefectCalculator',
            calculatorConfig: {
                closedStateValues: closedStates,
                granularity: this.granularity,
                endDate: this.release.get('ReleaseDate'),
                startDate: this.release.get('ReleaseStartDate')
            },
            
            chartConfig: this._getChartConfig()
        });
    },
    
    _getChartStoreConfig: function(oids) {        
        return {
           find: {
               ObjectID: { "$in": oids },
               _ProjectHierarchy: this.getContext().getProject().ObjectID , 
               _TypeHierarchy: 'Defect' 
           },
           removeUnauthorizedSnapshots: true,
           fetch: ['ObjectID','State','Severity','CreationDate'],
           hydrate: ['State','Severity'],
           sort: {
               '_ValidFrom': 1
           }
        };
    },
    
    _getChartConfig: function() {
        return {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: 'Defects by Severity'
            },
            xAxis: {
                tickmarkPlacement: 'on',
                tickInterval: this._getTickInterval(this.granularity),
                title: {
                    text: 'Date'
                },
                labels            : {
                    rotation : -45
                }
            },
            yAxis: [
                
                {
                    min: 0,
                    title: {
                        text: 'Count'
                    },
                    opposite: true
                },
                {
                    min: 0,
                    title: {
                        text: 'Count (cumulative)'
                    }
                }
            ],
            tooltip: { shared: true },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false
                    }
                },
                area: {
                    stacking: 'normal'
                }
            }
        };
    },
    
    _getTickInterval: function(granularity) {
        if ( Ext.isEmpty(granularity) ) { return 30; }
        
        
        granularity = granularity.toLowerCase();
        if (this.timebox_limit < 30) {
            return 1;
        }
        if ( granularity == 'day' ) { return 30; }
        
        return 1;
        
    },
      
    _loadWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID']
        };
        this.logger.log("Starting load:",config.model);
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    getSettingsFields: function() {
        var left_margin = 5;
        return [{
            name: 'closedStateValues',
            xtype: 'tsmultifieldvaluepicker',
            model: 'Defect',
            field: 'State',
            margin: left_margin,
            fieldLabel: 'States to Consider Closed',
            labelWidth: 150
        }];
    }
    
});