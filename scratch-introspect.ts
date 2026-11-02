import { execFileSync } from 'node:child_process';
const T = 'type { name kind ofType { name kind ofType { name kind ofType { name } } } }';
const qs = [
  `{ a: __type(name: "ProjectV2FieldValue") { inputFields { name ${T} } } b: __type(name: "UpdateProjectV2FieldInput") { inputFields { name ${T} } } }`,
  `{ c: __type(name: "ProjectV2MultiSelectField") { fields { name ${T} } } d: __type(name: "ProjectV2ItemFieldMultiSelectValue") { fields { name ${T} } } }`,
  `{ e: __type(name: "ProjectV2MultiSelectFieldOption") { fields { name } } f: __type(name: "ProjectV2MultiSelectFieldOptionInput") { inputFields { name ${T} } } }`,
];
for (const q of qs) {
  try {
    console.log('INTRO ' + execFileSync('gh', ['api', 'graphql', '-f', `query=${q}`], { encoding: 'utf8', env: { ...process.env, GH_TOKEN: process.env.PROJECT_TOKEN } }).trim());
  } catch (e) { console.log('INTRO-ERR ' + String((e as { stdout?: string }).stdout)); }
}
