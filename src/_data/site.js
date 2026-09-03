import { resolveSite } from "../../lib/site.mjs";

const now = new Date();

export default () => ({
  ...resolveSite(),
  buildDate: now.toISOString(),
  buildDay: now.toISOString().slice(0, 10),
});
