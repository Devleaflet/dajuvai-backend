import fs from "fs";
import path from "path";

export type MountedRoute = {
  method: string;
  path: string;
  source: string;
  requiresAuthentication: boolean;
  validationSchema?: string;
  validationSchemaFile?: string;
  validationProperty?: "body" | "query" | "params";
  middleware: string[];
  responseStatuses: number[];
};

const backendRoot = path.resolve(__dirname, "../..");
const indexFile = [
  path.join(backendRoot, "src/index.ts"),
  path.join(backendRoot, "src/index.js"),
].find((candidate) => fs.existsSync(candidate)) ?? path.join(backendRoot, "src/index.ts");

const normalizePath = (value: string) => {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const normalized = withLeadingSlash.replace(/\/+/g, "/").replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
};

const authMiddlewarePattern =
  /\b(authMiddleware|combinedAuthMiddleware|vendorAuthMiddleware|isVendor|isAdmin|isAdminOrStaff|isRider|requireUserRole|isAccountOwner|isVendorAccountOwnerOrAdminOrStaff|restrictToVendorOrAdmin|canReviewProduct|canDeleteReview)\b/;
const documentedMiddlewareNames = [
  "authMiddleware",
  "combinedAuthMiddleware",
  "vendorAuthMiddleware",
  "isVendor",
  "isAdmin",
  "isAdminOrStaff",
  "isRider",
  "requireUserRole",
  "isAccountOwner",
  "isAccountOwnerOrAdminOrStaff",
  "isVendorAccountOwnerOrAdminOrStaff",
  "restrictToVendorOrAdmin",
  "canReviewProduct",
  "canDeleteReview",
  "checkPermission",
  "validateZod",
  "asyncHandler",
];

const resolveRouteFile = (fromFile: string, importPath: string) => {
  const base = path.resolve(path.dirname(fromFile), importPath);
  if (fs.existsSync(`${base}.ts`)) return `${base}.ts`;
  if (fs.existsSync(`${base}.js`)) return `${base}.js`;
  if (fs.existsSync(path.join(base, "index.ts"))) return path.join(base, "index.ts");
  return path.join(base, "index.js");
};

const importMapFor = (source: string, file: string) => {
  const imports = new Map<string, string>();
  const pattern = /import\s+(\w+)\s+from\s+["']([^"']+)["']/g;

  for (const match of source.matchAll(pattern)) {
    if (match[2].startsWith(".")) {
      imports.set(match[1], resolveRouteFile(file, match[2]));
    }
  }

  const namedPattern = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(namedPattern)) {
    if (!match[2].startsWith(".")) continue;
    const importedFile = resolveRouteFile(file, match[2]);
    for (const importedName of match[1].split(",")) {
      const [name, alias] = importedName.trim().split(/\s+as\s+/);
      if (name) imports.set(alias ?? name, importedFile);
    }
  }

  return imports;
};

const extractFunctionBody = (source: string, methodName: string) => {
  const signature = new RegExp(`(?:async\\s+)?${methodName}\\s*\\([^)]*\\)[^{]*\\{`);
  const match = signature.exec(source);
  if (!match) return "";
  const openingBrace = source.indexOf("{", match.index + match[0].length - 1);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }
  return "";
};

const responseStatusesFor = (routeCall: string, imports: Map<string, string>) => {
  const controllerMatch = routeCall.match(
    /([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\.bind\s*\(/,
  );
  if (!controllerMatch) return [];
  const controllerFile = imports.get(controllerMatch[1]);
  if (!controllerFile || !fs.existsSync(controllerFile)) return [];
  const controllerSource = fs.readFileSync(controllerFile, "utf8");
  const body = extractFunctionBody(controllerSource, controllerMatch[2]);
  const statuses = [...body.matchAll(/\.status\s*\(\s*(\d{3})\s*\)/g)].map((match) => Number(match[1]));
  if (body.includes("res.json(") || body.includes("res.send(") || body.includes("res.redirect(")) {
    statuses.push(body.includes("res.redirect(") ? 302 : 200);
  }
  return [...new Set(statuses)];
};

const collectFromRouter = (
  file: string,
  mountPrefix: string,
  visited: Set<string>,
): MountedRoute[] => {
  if (visited.has(`${file}|${mountPrefix}`)) return [];
  visited.add(`${file}|${mountPrefix}`);

  const source = fs.readFileSync(file, "utf8");
  const imports = importMapFor(source, file);
  for (const match of source.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*new\s+(\w+)\s*\(/g)) {
    const importedFile = imports.get(match[2]);
    if (importedFile) imports.set(match[1], importedFile);
  }
  const sourceForRoutes = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const routerNames = new Set(
    [...sourceForRoutes.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*Router\s*\(\s*\)/g)].map(
      (match) => match[1],
    ),
  );
  const routes: MountedRoute[] = [];
  const inheritedAuthentication = [...sourceForRoutes.matchAll(
    /\b[A-Za-z_$][\w$]*\.use\s*\(([^)]*)\)/g,
  )].some((match) => authMiddlewarePattern.test(match[1]));

  const methodPattern = /\b[A-Za-z_$][\w$]*\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  for (const match of sourceForRoutes.matchAll(methodPattern)) {
    const owner = match[0].slice(0, match[0].indexOf("."));
    if (!routerNames.has(owner)) continue;
    const end = sourceForRoutes.indexOf(");", (match.index ?? 0) + match[0].length);
    const call = sourceForRoutes.slice(match.index ?? 0, end === -1 ? undefined : end);
    const validation = call.match(
      /validateZod\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*["'](body|query|params)["'])?/s,
    );
    routes.push({
      method: match[1].toUpperCase(),
      path: normalizePath(`${mountPrefix}/${match[2]}`),
      source: path.relative(backendRoot, file),
      requiresAuthentication: inheritedAuthentication || authMiddlewarePattern.test(call),
      validationSchema: validation?.[1],
      validationSchemaFile: validation?.[1] ? imports.get(validation[1]) : undefined,
      validationProperty: (validation?.[2] as MountedRoute["validationProperty"]) ??
        (validation ? "body" : undefined),
      middleware: documentedMiddlewareNames.filter((name) =>
        new RegExp(`\\b${name}\\b`).test(call),
      ),
      responseStatuses: responseStatusesFor(call, imports),
    });
  }

  const nestedPattern = /\b([A-Za-z_$][\w$]*)\.use\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  for (const match of sourceForRoutes.matchAll(nestedPattern)) {
    if (!routerNames.has(match[1])) continue;
    const childFile = imports.get(match[3]);
    if (childFile && fs.existsSync(childFile)) {
      routes.push(...collectFromRouter(childFile, normalizePath(`${mountPrefix}/${match[2]}`), visited));
    }
  }

  return routes;
};

const indexSource = fs.readFileSync(indexFile, "utf8");
const indexImports = importMapFor(indexSource, indexFile);
const mountedRouteInventory: MountedRoute[] = [];
const mountPattern = /app\.use\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;

for (const match of indexSource.matchAll(mountPattern)) {
  const routerFile = indexImports.get(match[2]);
  if (routerFile && fs.existsSync(routerFile)) {
    mountedRouteInventory.push(...collectFromRouter(routerFile, match[1], new Set()));
  }
}

export { mountedRouteInventory };

if (require.main === module) {
  const uniqueOperations = new Set(
    mountedRouteInventory.map(({ method, path: routePath }) => `${method} ${routePath}`),
  );
  console.log(`mounted operations: ${mountedRouteInventory.length}`);
  console.log(`unique operations: ${uniqueOperations.size}`);
}
