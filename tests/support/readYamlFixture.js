import { readFile } from "node:fs/promises";
import yaml from "js-yaml";

export const readYamlFixture = async (fileUrl) => {
  return yaml.load(await readFile(fileUrl, "utf8"));
};
