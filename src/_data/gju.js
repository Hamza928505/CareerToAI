// The GJU German Year rules, exposed to templates so the workspace eligibility
// checker scores against exactly the numbers the tracker workbook uses. Both
// read data/gju-rules.json; neither restates a threshold.
import path from "node:path";

import { ROOT, readJson } from "../../lib/content.mjs";

export default () => readJson(path.join(ROOT, "data", "gju-rules.json"));
