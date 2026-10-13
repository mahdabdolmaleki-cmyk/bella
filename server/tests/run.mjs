// Entry point: loads all modules, runs the suite, reports, writes JSON.
import { connect, disconnect, runAll, report } from "./harness.mjs";
import { writeFileSync } from "fs";
import * as core from "./modules/core.test.mjs";
import * as commerce from "./modules/commerce.test.mjs";
import * as firstPurchaseDiscount from "./modules/firstPurchaseDiscount.test.mjs";
import * as customerExport from "./modules/customerExport.test.mjs";
import * as soak from "./modules/soak.test.mjs";
import * as festivalExpiry from "./modules/festivalExpiry.test.mjs";
import * as rateLimit from "./modules/rateLimit.test.mjs";

const t0 = Date.now();
await connect();
await core.register();
await rateLimit.register();
await commerce.register();
await firstPurchaseDiscount.register();
await customerExport.register();
await soak.register();
await festivalExpiry.register();
const res = await runAll();
report(res);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\ncompleted in ${secs}s`);
writeFileSync(new URL("./suite-results.json", import.meta.url), JSON.stringify({ total: res.total, pass: res.pass, fail: res.failCount, byGroup: res.byGroup }, null, 2));
console.log("WROTE tests/suite-results.json");
await disconnect();
process.exit(res.failCount ? 1 : 0);
