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
            fields: ['field_value', 'color_mapping'],
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
        var columns = {};
        this._store.each(function(record) {
            columns[record.get('field_value')] = {
                'color_mapping': record.get('color_mapping')
            };
        }, this);
        return columns;
    },

    getErrors: function() {
        var errors = [];
        if (this._storeLoaded && !Ext.Object.getSize(this._buildSettingValue())) {
            errors.push('At least one column must be shown.');
        }
        return errors;
    },

    setValue: function(value) {
        this.callParent(arguments);
        this._value = value;
    },

    _getColumnValue: function(columnName) {
        var value = this._value;

        if ( Ext.isEmpty(value) ) {
            return null;
        }
        
        if ( Ext.isString(value) ) {
            value = Ext.JSON.decode(value);
        }
        
        if ( Ext.isString(value)[columnName] ) {
            return Ext.JSON.decode(value)[columnName];
        }

        return value[columnName];
    },

    refreshWithNewField: function(field) {
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
        if ( Ext.isFunction(allowedValue.get)) {
            field_value = allowedValue.get('StringValue');
        } else {
            field_value = allowedValue.StringValue;
        }
       // var pref = this._store.getCount() === 0 ? this._getColumnValue(field_value) : null;
        var pref = this._getColumnValue(field_value);

        var column = { 
            field_value: field_value,
            color_mapping: ''
        };
        
        if (pref) {
            if ( Ext.isString(pref) ) {
                column.color_mapping = pref;
            } else {
                column.color_mapping = pref.color_mapping;
            }
        }

        return column;

    }
});