import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

/**
 * Thin wrapper around AG Grid (Quartz theme, orange+grey-tuned in index.css).
 * Provides sensible enterprise defaults: sortable + filterable columns,
 * resizing, and a quick-filter hook. Pass `quickFilter` text to filter across
 * all columns; column header menus give per-column filtering.
 */
export default function DataGrid({
  rowData,
  columnDefs,
  quickFilter = '',
  loading = false,
  height = 560,
  pagination = true,
  paginationPageSize = 10,
  onRowClicked,
  ...rest
}) {
  return (
    <div className="ag-theme-quartz w-full overflow-hidden rounded-xl border border-line" style={{ height }}>
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        quickFilterText={quickFilter}
        loading={loading}
        animateRows
        pagination={pagination}
        paginationPageSize={paginationPageSize}
        paginationPageSizeSelector={[10, 20, 50]}
        rowSelection="single"
        onRowClicked={onRowClicked}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
          flex: 1,
          minWidth: 120,
          suppressHeaderMenuButton: false
        }}
        {...rest}
      />
    </div>
  );
}
