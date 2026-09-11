// The tracker schema (columns and the one status vocabulary) for the workspace
// table. The rows themselves are deliberately not built into the site: they are
// personal, data/tracker.csv is gitignored, and the workspace reads them live
// from the local editor server instead.
import { SCHEMA, STATUSES, OPEN_STATUSES } from "../../lib/tracker.mjs";

export default () => ({
  columns: SCHEMA.columns,
  statuses: SCHEMA.statuses,
  statusValues: STATUSES,
  openStatuses: OPEN_STATUSES,
});
