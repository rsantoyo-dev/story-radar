import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const localRequire = createRequire(import.meta.url);

/**
 * For the step tests: loads one of this folder's modules into a sandbox,
 * with `mocks` for what it imports. A local module that is not mocked (the
 * funnel's runner) is loaded into the same sandbox, so it shares the mocks
 * and the globals (a fake clock among them).
 */
export function loadInSandbox(file: string, mocks: Record<string, unknown>, globals: Record<string, unknown>): Record<string, unknown> {
  const context = vm.createContext({ JSON, Error, Object, Array, Math, Number, String, Boolean, Set, Map, Promise, Intl, console, setInterval, clearInterval, ...globals });
  const modules = new Map<string, Record<string, unknown>>();
  const load = (path: string): Record<string, unknown> => {
    const loaded = modules.get(path);
    if (loaded) return loaded;
    const exports: Record<string, unknown> = {};
    modules.set(path, exports);
    const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const evaluate = vm.runInContext(`(function (exports, require) {\n${code}\n})`, context) as (exports: unknown, require: (name: string) => unknown) => void;
    evaluate(exports, (name) => name in mocks ? mocks[name] : name.startsWith("./") ? load(`${name}.ts`) : localRequire(name));
    return exports;
  };
  return load(file);
}
