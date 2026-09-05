/**
 * Zoncute — GitHub OAuth bridge for the /admin (Decap CMS) login button.
 *
 * Decap CMS can't talk to GitHub's OAuth login directly from the browser
 * (GitHub requires a server-side secret exchange). This tiny Cloudflare
 * Worker does just that exchange, then hands the login back to the CMS
 * popup window. It never sees or stores anything about your products —
 * it only ever touches the GitHub login handshake.
 *
 * Set two secrets after deploying (Cloudflare dashboard: Settings > Variables):
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 */ 

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth") {
      const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
      authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/callback`);
      authorizeUrl.searchParams.set("scope", "repo,user");
      return Response.redirect(authorizeUrl.toString(), 302);
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code", { status: 400 });
      }

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        return new Response(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`, { status: 400 });
      }

      const token = tokenData.access_token;
      const payloadSuccess = JSON.stringify({ token, provider: "github" });
      const html = `<!doctype html><html><body>
<script>
(function () {
  function receiveMessage(e) {
    window.opener.postMessage(
      'authorization:github:success:${escapeForScript(payloadSuccess)}',
      e.origin
    );
    window.removeEventListener("message", receiveMessage, false);
  }
  window.addEventListener("message", receiveMessage, false);
  window.opener.postMessage("authorizing:github", "*");
})();
<\/script>
Login successful, you can close this window.
</body></html>`;

      return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    return new Response("Zoncute CMS auth bridge is running.", { status: 200 });
  },
};

function escapeForScript(str) {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
