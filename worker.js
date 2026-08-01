/**
 * px-proxy — 시세 CSV 중계용 Cloudflare Worker
 *
 * 하는 일: 브라우저가 CORS 때문에 직접 못 부르는 Stooq / FRED CSV를
 *          대신 받아와 CORS 헤더를 붙여 돌려준다. 그게 전부.
 *
 * 배포:  Cloudflare 대시보드 → Workers & Pages → Create → Worker
 *        이름: px-proxy  →  이 파일 내용을 통째로 붙여넣고 Deploy
 *
 * 확인:  https://px-proxy.<계정>.workers.dev/health   → ok 가 뜨면 성공
 */

const ALLOW = ["stooq.com", "fred.stlouisfed.org"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response("ok", {
        headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    if (url.pathname !== "/px") {
      return new Response("not found", { status: 404, headers: CORS });
    }

    const target = url.searchParams.get("u");
    if (!target) {
      return new Response("missing u parameter", { status: 400, headers: CORS });
    }

    let host;
    try {
      host = new URL(target).hostname;
    } catch {
      return new Response("invalid url", { status: 400, headers: CORS });
    }

    if (!ALLOW.some(d => host === d || host.endsWith("." + d))) {
      return new Response("host not allowed: " + host, { status: 403, headers: CORS });
    }

    try {
      const upstream = await fetch(target, {
        cf: { cacheTtl: 300, cacheEverything: true },
        headers: {
          // Stooq 는 기본 UA 를 종종 거절한다
          "User-Agent": "Mozilla/5.0 (compatible; px-proxy/1.0)",
          "Accept": "text/csv,text/plain,*/*"
        }
      });

      const body = await upstream.text();

      return new Response(body, {
        status: upstream.status,
        headers: {
          ...CORS,
          "Content-Type": "text/csv; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "X-Upstream-Status": String(upstream.status)
        }
      });
    } catch (err) {
      return new Response("upstream error: " + err.message, {
        status: 502,
        headers: CORS
      });
    }
  }
};
