import fs from "fs";
import path from "path";

const localesDir = "ui/src/i18n/locales";
const enPath = path.join(localesDir, "en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));

function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === "object") {
      if (!target[key] || typeof target[key] !== "object") {
        target[key] = {};
      }
      deepMerge(target[key], source[key]);
    } else {
      if (target[key] === undefined) {
        target[key] = source[key];
      }
    }
  }
  return target;
}

const files = fs.readdirSync(localesDir).filter(f => f.endsWith(".json") && f !== "en.json");

for (const file of files) {
  const filePath = path.join(localesDir, file);
  const localeData = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const mergedData = deepMerge(localeData, en);
  fs.writeFileSync(filePath, JSON.stringify(mergedData, null, 2) + "\n");
  console.log(`Updated ${file}`);
}
