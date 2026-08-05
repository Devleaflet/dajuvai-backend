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

if (unresolvedRefs.length || missingPaths.length || mountedAffectedPaths.length !== requiredPaths.length) {
  console.error(JSON.stringify({ unresolvedRefs, missingPaths, mountedAffectedPaths }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Swagger valid: ${Object.keys(document.paths ?? {}).length} paths, ${refs.length} local references`);
}
