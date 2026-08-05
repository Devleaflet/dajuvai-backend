import swaggerSpec from "../../swagger";
import { mountedRouteInventory } from "./routeInventory";

type JsonValue = unknown;

const referencesIn = (value: JsonValue, refs: string[] = []): string[] => {
  if (Array.isArray(value)) {
    value.forEach((entry) => referencesIn(entry, refs));
    return refs;
  }
  if (!value || typeof value !== "object") return refs;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "$ref" && typeof entry === "string") refs.push(entry);
    else referencesIn(entry, refs);
  }
  return refs;
};

const resolveLocalReference = (document: any, reference: string): unknown => {
  if (!reference.startsWith("#/")) return undefined;
  return reference
    .slice(2)
    .split("/")
    .reduce((current, segment) => current?.[segment], document);
};

const documentedPath = (routePath: string): string =>
  routePath.replace(/:\w+/g, (name) => `{${name.slice(1)}}`);

const document = swaggerSpec as any;
const refs = referencesIn(document);
const unresolvedRefs = refs.filter((reference) => !resolveLocalReference(document, reference));
const requiredPaths = [
  "/api/search/catalog",
  "/api/checkout/mobile-checkout-details",
  "/api/checkout/mobile-estimate",
  "/api/checkout/mobile-order",
];
const missingPaths = requiredPaths.filter((routePath) => !document.paths?.[routePath]);
const mountedAffectedPaths = mountedRouteInventory
  .map((route) => documentedPath(route.path))
  .filter((routePath) => requiredPaths.includes(routePath));
const missingMountedOperations = mountedRouteInventory
  .map((route) => ({
    method: route.method.toLowerCase(),
    path: documentedPath(route.path),
  }))
  .filter(({ method, path: routePath }) => !document.paths?.[routePath]?.[method]);

const missingRequestDocumentation: Array<{ method: string; path: string; property: string; schema?: string }> = [];
const missingPathParameters: Array<{ method: string; path: string; parameter: string }> = [];
const missingResponseStatuses: Array<{ method: string; path: string; status: number }> = [];
const emptySuccessResponses: Array<{ method: string; path: string; status: string }> = [];

for (const route of mountedRouteInventory) {
  const path = documentedPath(route.path);
  const operation = document.paths?.[path]?.[route.method.toLowerCase()];
  if (!operation) continue;

  if (route.validationProperty === "body" && !operation.requestBody) {
    missingRequestDocumentation.push({ method: route.method, path, property: "body", schema: route.validationSchema });
  }
  if (route.validationProperty === "query" && !(operation.parameters ?? []).some((parameter: any) => parameter.in === "query")) {
    missingRequestDocumentation.push({ method: route.method, path, property: "query", schema: route.validationSchema });
  }
  if (route.validationProperty === "params" && !(operation.parameters ?? []).some((parameter: any) => parameter.in === "path")) {
    missingRequestDocumentation.push({ method: route.method, path, property: "params", schema: route.validationSchema });
  }

  for (const parameterName of [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1])) {
    const documented = (operation.parameters ?? []).some(
      (parameter: any) => parameter.in === "path" && parameter.name === parameterName && parameter.required === true,
    );
    if (!documented) missingPathParameters.push({ method: route.method, path, parameter: parameterName });
  }

  for (const status of route.responseStatuses) {
    if (!operation.responses?.[String(status)]) {
      missingResponseStatuses.push({ method: route.method, path, status });
    }
  }
  for (const status of ["200", "201", "202"]) {
    const response = operation.responses?.[status];
    if (response && !response.content && !response.$ref) {
      emptySuccessResponses.push({ method: route.method, path, status });
    }
  }
}

if (
  unresolvedRefs.length ||
  missingPaths.length ||
  mountedAffectedPaths.length !== requiredPaths.length ||
  missingMountedOperations.length ||
  missingRequestDocumentation.length ||
  missingPathParameters.length ||
  missingResponseStatuses.length ||
  emptySuccessResponses.length
) {
  console.error(JSON.stringify({
    unresolvedRefs,
    missingPaths,
    mountedAffectedPaths,
    missingMountedOperations,
    missingRequestDocumentation,
    missingPathParameters,
    missingResponseStatuses,
    emptySuccessResponses,
  }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Swagger valid: ${Object.keys(document.paths ?? {}).length} paths, ${refs.length} local references`);
}
