import { describe, expect, it } from "vitest";

import config from "./env.config";
import { corsOptions } from "./cors.config";

describe("production CORS", () => {
  it("allows an originless server request while keeping browser origins restricted", () => {
    const previous = config.NODE_ENV;
    config.NODE_ENV = "production";

    try {
      const origin = corsOptions.origin;
      if (typeof origin !== "function") throw new Error("Expected a CORS origin callback");

      let originlessResult: Error | null | undefined;
      origin(undefined, (error) => { originlessResult = error; });
      expect(originlessResult).toBeNull();

      let untrustedResult: Error | null | undefined;
      origin("https://untrusted.example", (error) => { untrustedResult = error; });
      expect(untrustedResult).toBeInstanceOf(Error);
    } finally {
      config.NODE_ENV = previous;
    }
  });
});
