import { afterEach, describe, expect, it, vi } from "vitest";

import config from "../config/env.config";

const compile = async (html: string) => {
    vi.resetModules();
    const { attachInlineLogo } = await import("./emailLayout.utils");
    const mail = { data: { html, attachments: [] as unknown[] } };
    await new Promise<void>((resolve, reject) => attachInlineLogo(mail, (e) => (e ? reject(e) : resolve())));
    return mail.data;
};

describe("inline email logo", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("attaches the logo as an inline part when the html references it", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 })));
        const data = await compile('<img src="cid:dajuvai-logo" alt="DajuVai">');
        expect(data.attachments).toEqual([expect.objectContaining({ cid: "dajuvai-logo", contentDisposition: "inline", contentType: "image/png" })]);
        expect(data.html).toContain("cid:dajuvai-logo");
    });

    it("falls back to the hosted logo when it cannot be fetched", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
        const data = await compile('<img src="cid:dajuvai-logo" alt="DajuVai">');
        expect(data.attachments).toEqual([]);
        expect(data.html).toBe(`<img src="${config.EMAIL_LOGO_URL}" alt="DajuVai">`);
    });

    it("leaves mail without the logo alone", async () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        const data = await compile("<p>Plain</p>");
        expect(data.attachments).toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
    });
});
