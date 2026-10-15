// 調査用: 指定した URL を取得して、状態とテキストの先頭を表示する (Actions のログで構造を確かめる)
const urls = (process.env.PROBE_URLS ?? "").split(/\s+/).filter(Boolean);
const max = Number(process.env.PROBE_MAX ?? 6000);
for (const url of urls) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "umauma-personal-research (github.com/kazuto-desu/umauma)" } });
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") ?? "";
    const charset = /shift_jis|sjis|euc-jp/i.exec(type)?.[0] ?? /charset=["']?(shift_jis|euc-jp)/i.exec(buf.toString("latin1"))?.[1];
    const html = new TextDecoder(charset ? (/euc/i.test(charset) ? "euc-jp" : "shift_jis") : "utf-8").decode(buf);
    console.log(`\n===== ${url}\nstatus=${res.status} type=${type} bytes=${buf.length}`);
    console.log(process.env.PROBE_RAW ? html.slice(0, max) : html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/\s+/g, " ").slice(0, max));
  } catch (e) {
    console.log(`\n===== ${url}\nerror ${e}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
