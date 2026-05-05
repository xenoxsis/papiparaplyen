import { readFileSync, writeFileSync } from "fs";
const f = "src/app/(site)/member/schedule/page.tsx";
const lines = readFileSync(f, "utf8").split("\n");
console.log("before:", lines.length);
writeFileSync(f, lines.slice(0, 597).join("\n") + "\n");
console.log("after:", readFileSync(f, "utf8").split("\n").length);
