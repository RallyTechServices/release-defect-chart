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
    all_values: [],
    
    config: {
        defaultSettings: {
            closedStateValues: ['Closed'],
            groupField: 'Severity',
            colorMappingByGroup: {}
        }
    
    },
    
    integrationHeaders : {
        name : "TSReleaseDefectChart"
    },
                        
    launch: function() {
        console.log('--', this.getSettings());
        
        this.group_field = this.getSetting('groupField') || 'Severity';
        this.colors_by_field = this.getSetting('colorMappingByGroup') || {};

        if ( Ext.isString(this.colors_by_field) ) {
            this.colors_by_field = Ext.JSON.decode(this.colors_by_field);
        }
        
        this.colors = this.colors_by_field[this.group_field] || {};
        
        TSUtilities.getAllowedValues('Defect',this.group_field).then({
            scope: this,
            success: function(values) {
                this.all_values = values;
                this._addSelectors(this.down('#selector_box'));
            },
            failure: function(msg){
                Ext.Msg.alert("Issue Loading Values", msg);
            }
        });
        
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
        
        container.add({xtype:'container',flex:1});
        
        container.add({
            xtype: 'rallybutton',
            iconCls: 'icon-export secondary rly-small',
            margin: 10,
            listeners: {
                click: this._export,
                scope: this
            }
        });
        
        container.add({
            xtype: 'container',
            itemId: 'etlDate',
            padding: 10,
            tpl: '<tpl><div class="etlDate">Data current as of {etlDate}</div></tpl>'
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
        
        this.logger.log("Closed States:", closedStates);
        this.logger.log("Group Values", this.all_values);
        
        container.add({
            xtype: 'rallychart',
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getChartStoreConfig(oids),
            
            calculatorType: 'CA.techservices.calculator.DefectCalculator',
            calculatorConfig: {
                closedStateValues: closedStates,
                allowedGroupValues: this.all_values,
                groupField: this.group_field,
                granularity: this.granularity,
                endDate: this.release.get('ReleaseDate'),
                startDate: this.release.get('ReleaseStartDate'),
                colors: this.colors
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
           fetch: ['ObjectID','State','FormattedID',this.group_field,'CreationDate'],
           hydrate: ['State',this.group_field],
           sort: {
               '_ValidFrom': 1
           },
           limit: Infinity,
           listeners: {
               load: this._updateETLDate,
               scope: this
           }
        };
    },
    
    _getChartConfig: function() {
        return {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: 'Defects by ' + this.group_field
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
                column: {
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
    
    _fieldIsNotHidden: function(field) {
        if ( field.hidden ) { return false; }

        if ( field.attributeDefinition && field.attributeDefinition.Constrained ) {
            if ( field.attributeDefinition.SchemaType == "string" ) {
                return true;
            }
        }
        return false;
    },
    
    getSettingsFields: function() {
        var me = this;
        var left_margin = 5;
        return [{
            name: 'closedStateValues',
            xtype: 'tsmultifieldvaluepicker',
            model: 'Defect',
            field: 'State',
            margin: left_margin,
            fieldLabel: 'States to Consider Closed',
            labelWidth: 150
        },{
            name: 'groupField',
            xtype: 'rallyfieldcombobox',
            model: 'Defect',
            _isNotHidden: me._fieldIsNotHidden,
            margin: left_margin,
            fieldLabel: 'Group Field',
            labelWidth: 150,
            bubbleEvents: ['groupfieldselected'],
            listeners: {
                change: function(cb) {
                    this.fireEvent('groupfieldselected',cb.getValue());
                }
            }
        },{
            name: 'colorMappingByGroup',
            readyEvent: 'ready',
            fieldLabel: 'Colors by Field Value',
            width: this.getWidth() -10,
            margin: 0,
            height: 175,
            field: 'Severity',
            model: 'Defect',
            xtype: 'colorsettingsfield',
            handlesEvents: {
                groupfieldselected: function(field) {
                    this.refreshWithNewField(field);
                }
            },
//            listeners: {
//                ready: function() {
//                    this.fireEvent('colorsettingsready');
//                }
//            },
//            bubbleEvents: 'colorsettingsready'
        }];
    },
    
    _updateETLDate: function(store, records, success){
        this.logger.log('_updateETLDate', store, records, success);
        var etlDate = store && store.proxy && store.proxy._etlDate;
        if (etlDate){
            this.down('#etlDate').update({etlDate: Rally.util.DateTime.fromIsoString(etlDate)});
        }
    },
    
    _export: function(){
        var me = this,
            chart = this.down('rallychart'),
            snapshots = chart && chart.calculator && chart.calculator.snapshots,
            chartEndDate = chart.calculator.endDate,
            chartStartDate = chart.calculator.startDate;
        this.logger.log('_Export', chart.calculator ,chartStartDate, chartEndDate);
        if (snapshots){
            var csv = [];
            var headers = ['FormattedID',me.group_field,'State','_ValidFrom','_ValidTo'];
            csv.push(headers.join(','));
            Ext.Array.each(snapshots, function(s){
                var validFrom = Rally.util.DateTime.fromIsoString(s._ValidFrom),
                    validTo = Rally.util.DateTime.fromIsoString(s._ValidTo);

                if (validFrom < chartEndDate && validTo >= chartStartDate){
                    var row = [s.FormattedID, s[me.group_field], s.State, s._ValidFrom, s._ValidTo];
                    csv.push(row.join(','));
                }
            });
            csv = csv.join("\r\n");

            CArABU.technicalservices.Exporter.saveCSVToFile(csv, Ext.String.format('export-{0}.csv', Rally.util.DateTime.format(new Date(), 'Y-m-d')));
        }
    }
    
});
