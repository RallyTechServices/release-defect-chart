/**
 *
 */
Ext.define('Rally.techservices.ColorSettingsField', {
    extend: 'Ext.form.field.Base',
    alias: 'widget.colorsettingsfield',
    plugins: ['rallyfieldvalidationui'],

    fieldSubTpl: '<div id="{id}" class="settings-grid"></div>',

    cls: 'column-settings',

    config: {
        /**
         * @cfg {Object}
         *
         * The column settings value for this field
         */
        value: undefined,
        
        model: 'Defect',
        
        field: 'Severity'
    },

    onDestroy: function() {
        if (this._grid) {
            this._grid.destroy();
            delete this._grid;
        }
        this.callParent(arguments);
    },

    onRender: function() {
        this.callParent(arguments);

        this._store = Ext.create('Ext.data.Store', {
            fields: ['field_value', 'color_mapping','field_name'],
            data: []
        });

        var gridWidth = Math.min(this.getWidth(true)-100, 500);

        this._grid = Ext.create('Rally.ui.grid.Grid', {
            maxWidth: gridWidth,
            height: 150,
            renderTo: this.inputEl,
            columnCfgs: this._getColumnCfgs(),
            showPagingToolbar: false,
            showRowActionsColumn: false,
            enableRanking: false,
            store: this._store,
            editingConfig: {
                publishMessages: false
            }
        });
        
        this._getColorField();
    },
    
    _getColorField: function() {
        var me = this;

        Rally.data.ModelFactory.getModel({
            type: this.model,
            success: function(model) {
                var field = model.getField(me.field);
                me.refreshWithNewField(field);
            }
        });

    },

    _getColumnCfgs: function() {
        var me = this;
        var columns = [
            {
                text: 'Value',
                dataIndex: 'field_value',
                emptyCellText: 'None',
                flex: 1
            },
            {
                text: 'Color',
                dataIndex: 'color_mapping',
                editor: {
                    xtype: 'rallytextfield',
                    flex: 1
                }
            }
        ];

        return columns;
    },
    
    /**
     * When a form asks for the data this field represents,
     * give it the name of this field and the ref of the selected project (or an empty string).
     * Used when persisting the value of this field.
     * @return {Object}
     */
    getSubmitData: function() {
        var data = {};
        data[this.name] = Ext.JSON.encode( this._buildSettingValue() );

        return data;
    },

    _buildSettingValue: function() {
        var colors = {};
        var settings = this._value || {};
        if ( Ext.isString(settings) ) { 
            settings = Ext.JSON.decode(settings);
        }
        
        var has_changed_value = false;
        this._store.each(function(record) {
            
            if ( record.get('field_name') == this.field ) {
                has_changed_value = true;
                colors[record.get('field_value')] = record.get('color_mapping');
            }
        }, this);
        
        if ( Ext.isEmpty(colors['None']) && !Ext.isEmpty(colors['']) ) {
            colors['None'] = colors[''];
        }
        
        if ( has_changed_value ) {
            settings[this.field] = colors;
        }
        return settings;
    },

    setValue: function(value) {
        this.callParent(arguments);
        this._value = value;
    },

    _getColumnValue: function(column_name) {
        var value = this._value;
        var field_name = this.field;

        if ( Ext.isEmpty(value) ) {
            return null;
        }
        
        if ( Ext.isString(value) ) {
            value = Ext.JSON.decode(value);
        }
        
        if ( Ext.isEmpty(value[field_name])) {
            // no settings for this particular grouping field
            return null;
        }
        
        if ( Ext.isEmpty(value[field_name][column_name]) ) {
            // has settings for this grouping field, but not for this value
            return null;
        }
        return value[field_name][column_name];
    },

    refreshWithNewField: function(field) {
        this._value = this._buildSettingValue();

        delete this._storeLoaded;
        if ( Ext.isString(field) ) {
            this.field = field;
            this._getColorField();
            return;
        }
        
        field.getAllowedValueStore().load({
            callback: function(records, operation, success) {
                var data = Ext.Array.map(records, this._recordToGridRow, this);
                
                this._store.loadRawData(data);
                
                this.fireEvent('ready');
                this._storeLoaded = true;
            },
            scope: this
        });
    },

    _recordToGridRow: function(allowedValue) {
        var field_value = "";
        var field_name = this.field;
        
        if ( Ext.isFunction(allowedValue.get)) {
            field_value = allowedValue.get('StringValue');
        } else {
            field_value = allowedValue.StringValue;
        }
       // var pref = this._store.getCount() === 0 ? this._getColumnValue(field_value) : null;
        var pref = this._getColumnValue(field_value);

        var column = { 
            field_value: field_value,
            color_mapping: '',
            field_name: field_name
        };
        
        if (pref) {
            column.color_mapping = pref;
        }

        return column;
    }
});