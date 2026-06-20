const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveTypeScript(request, parent, isMain, options) {
  try {
    return resolveFilename.call(this, request, parent, isMain, options);
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND" && request.startsWith(".")) {
      for (const extension of [".ts", ".tsx"]) {
        try {
          return resolveFilename.call(this, `${request}${extension}`, parent, isMain, options);
        } catch {
          // Try the next TypeScript extension.
        }
      }
    }
    if (error && error.code === "MODULE_NOT_FOUND" && request.startsWith("@/")) {
      const target = request.startsWith("@/lib/")
        ? path.join(process.cwd(), "src", "lib", request.slice("@/lib/".length))
        : path.join(process.cwd(), request.slice(2));
      return resolveFilename.call(this, target, parent, isMain, options);
    }
    throw error;
  }
};

function register(extension) {
  require.extensions[extension] = function loadTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      },
      fileName: filename
    }).outputText;
    module._compile(output, filename);
  };
}

register(".ts");
register(".tsx");
