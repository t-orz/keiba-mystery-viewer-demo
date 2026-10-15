#!/usr/bin/env bash
# 閲覧サイトの app.js / styles.css / config.js を読み込む URL に ?v=<時刻> を付け直す（2026-10-12）。
#
# GitHub Pages はファイルを10分キャッシュさせる（Cache-Control: max-age=600）ので、
# 更新直後は「新しい index.html ＋ 古い app.js」の組み合わせで表示が崩れることがある
# （確定結果ブロック分離の直後に実際に起きた）。URL を変えれば必ず新しいファイルを読む。
#
# 使い方:
#   tools/bump_asset_version.sh            HTML の ?v= を今の時刻に書き換える
#   tools/bump_asset_version.sh --staged   pre-commit 用。上の3ファイルのどれかがステージされて
#                                          いるときだけ書き換えて、その HTML もステージする
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

HTMLS=(index.html help.html admin/index.html)

if [[ "${1:-}" == "--staged" ]]; then
  git diff --cached --name-only | grep -qxE "app\.js|styles\.css|config\.js" || exit 0
fi

V="$(date +%Y%m%d%H%M%S)"
for f in "${HTMLS[@]}"; do
  [[ -f "$f" ]] || continue
  if [[ "${1:-}" == "--staged" ]] && ! git diff --quiet -- "$f"; then
    echo "bump_asset_version: $f にステージしていない変更があるので ?v= を書き換えません" >&2
    continue
  fi
  sed -i -E \
    -e "s#(href=\"(\.\./)?styles\.css)(\?v=[0-9]+)?\"#\1?v=${V}\"#g" \
    -e "s#(src=\"(\.\./)?(app|config)\.js)(\?v=[0-9]+)?\"#\1?v=${V}\"#g" \
    "$f"
  [[ "${1:-}" == "--staged" ]] && git add -- "$f"
done
exit 0
