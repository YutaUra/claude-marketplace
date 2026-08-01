#!/usr/bin/env bun
// Keepa の価格履歴を無料で取得する。
// 仕組み: keepa.com にログイン済みの永続プロファイルで headless Chrome を起動し、
// WebSocket (wss://push.keepa.com) をフックして商品データ JSON を傍受する。
// 詳細な調査経緯・制約は skill の SKILL.md / references を参照。
//
// 使い方:
//   bun fetch-keepa.ts <ASIN> [--domain=5] [--raw]
//   domain: 1=com 2=co.uk 3=de 4=fr 5=co.jp 6=ca 8=it 9=es 10=in 11=com.mx
import { parsePairSeries, CSV_INDEX, keepaMinutesToDate } from "./lib/keepa-parse";

const HOME = process.env.HOME!;
const PROFILE = `${HOME}/.playwright-profiles/keepa`;
// config はスクリプトと同梱（skill 内で自己完結させるため、利用側リポジトリに依存しない）
const CONFIG = new URL("./keepa.config.json", import.meta.url).pathname;
const SESSION = "keepa";

const args = process.argv.slice(2);
const asin = args.find((a) => !a.startsWith("--"));
const domain = args.find((a) => a.startsWith("--domain="))?.split("=")[1] ?? "5";
const raw = args.includes("--raw");
if (!asin) {
  console.error("usage: bun fetch-keepa.ts <ASIN> [--domain=5] [--raw]");
  process.exit(1);
}

async function cli(...cmd: string[]): Promise<string> {
  const proc = Bun.spawn(["playwright-cli", `-s=${SESSION}`, ...cmd], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) throw new Error(`playwright-cli ${cmd[0]} failed: ${err || out}`);
  return out;
}

// フル履歴は zstd 圧縮 (マジック 0x28B5 2FFD) の basicProducts メッセージで届く。
// 短期間トラッキング商品は非圧縮の小さい basicProducts しか来ないため、
// 「圧縮メッセージを5秒待ち、来なければ非圧縮版を採用」する。
const pageCode = `async page => {
  await page.addInitScript(() => {
    window.__prod = null; window.__prodFull = null;
    const OW = window.WebSocket;
    window.WebSocket = function(u, p) {
      const ws = p ? new OW(u, p) : new OW(u);
      ws.addEventListener('message', e => { try {
        let u8 = new Uint8Array(e.data);
        const zstd = u8[0] === 0x28 && u8[1] === 0xb5 && u8[2] === 0x2f && u8[3] === 0xfd;
        if (zstd) u8 = fzstd.decompress(u8);
        const o = JSON.parse(new TextDecoder().decode(u8));
        if (o.basicProducts && o.basicProducts[0] && o.basicProducts[0].asin === '${asin}') {
          if (zstd) window.__prodFull = o.basicProducts[0];
          else window.__prod = o.basicProducts[0];
        }
      } catch (err) {} });
      return ws;
    };
    window.WebSocket.prototype = OW.prototype;
    Object.assign(window.WebSocket, OW);
  });
  await page.goto('https://keepa.com/#!product/${domain}-${asin}');
  await page.reload();
  await page.waitForFunction(() => window.__prod || window.__prodFull, { timeout: 30000 });
  await page.waitForFunction(() => window.__prodFull, { timeout: 5000 }).catch(() => {});
  return await page.evaluate(() => JSON.stringify(window.__prodFull || window.__prod));
}`;

await cli("open", `--config=${CONFIG}`, `--profile=${PROFILE}`).catch(() => {
  // 既に同名セッションが開いている場合は再利用する
});
try {
  const out = await cli("run-code", pageCode);
  // run-code の出力から Result セクションの JSON 文字列リテラルを取り出す
  const m = out.match(/### Result\n("(?:[^"\\]|\\.)*")/);
  if (!m) throw new Error(`商品データを抽出できませんでした。出力:\n${out.slice(0, 2000)}`);
  const product = JSON.parse(JSON.parse(m[1]));

  if (raw) {
    console.log(JSON.stringify(product, null, 2));
  } else {
    const csv = product.csv ?? [];
    console.log(
      JSON.stringify(
        {
          asin: product.asin,
          title: product.title,
          domainId: product.domainId,
          trackingSince: keepaMinutesToDate(product.trackingSince).toISOString(),
          series: {
            amazon: parsePairSeries(csv[CSV_INDEX.AMAZON]),
            new: parsePairSeries(csv[CSV_INDEX.NEW]),
            used: parsePairSeries(csv[CSV_INDEX.USED]),
            salesRank: parsePairSeries(csv[CSV_INDEX.SALES_RANK]),
          },
        },
        null,
        2,
      ),
    );
  }
} finally {
  await cli("close").catch(() => {});
}
