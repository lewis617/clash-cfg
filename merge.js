#!/usr/bin/env node
/**
 * 把私有 overlay 合并进公开模板，产出一份完整的 mihomo 配置。
 *
 * 设计目标：本仓库可以公开，私有内容（自定义分组、特定站点规则）只存在于
 * 使用者本地的 overlay 文件里。合并逻辑本身不含任何私有数据。
 *
 * 用法：
 *   node merge.js --base clash-cfg.yml --overlay overlay.yml --out config.yaml
 *   node merge.js --base https://gh-proxy.com/https://raw.githubusercontent.com/lewis617/clash-cfg/main/clash-cfg.yml \
 *                 --overlay ~/.config/mihomo/local/overlay.yml --out ~/.config/mihomo/config.yaml
 *
 * overlay 的语义（只增不减，永远不改仓库里没有的东西）：
 *   1. 普通标量/对象         → 递归覆盖同路径的值
 *   2. 具名列表              → 按 name 合并：同名整项覆盖，新名字追加到末尾
 *                              适用 proxies / proxy-groups / proxy-providers /
 *                              rule-providers / listeners / tunnels
 *   3. 任意列表的 `_append`  → 追加到该列表末尾，例：rules_append、dns.fake-ip-filter_append
 *   4. 任意列表的 `_prepend` → 插到该列表最前面，例：rules_prepend
 *
 * 注释保留：用 yaml 的 Document API 原地改动，未被 overlay 触碰的键（含其内部注释）
 * 原样保留；被覆盖的那一项会重建，其内部注释会丢失。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parseDocument, isSeq } from 'yaml';

const NAMED_LIST_KEYS = new Set([
  'proxies',
  'proxy-groups',
  'proxy-providers',
  'rule-providers',
  'listeners',
  'tunnels',
]);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const toJS = (node) => (node && typeof node.toJSON === 'function' ? node.toJSON() : node);

function shallowMerge(base, over) {
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? shallowMerge(out[k], v) : v;
  }
  return out;
}

async function loadText(src) {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`拉取 ${src} 失败：HTTP ${res.status}`);
    return res.text();
  }
  return readFile(src, 'utf8');
}

/** 具名列表按 name 合并：同名整项覆盖（浅合并字段），新名字追加 */
function mergeNamedList(doc, path, items) {
  const node = doc.getIn(path, true);
  if (!isSeq(node)) {
    doc.setIn(path, items);
    return;
  }
  for (const item of items) {
    const name = item?.name;
    const idx =
      name === undefined
        ? -1
        : node.items.findIndex((n) => toJS(n)?.name === name);
    if (idx >= 0) {
      node.items[idx] = doc.createNode(shallowMerge(toJS(node.items[idx]), item));
    } else {
      node.items.push(doc.createNode(item));
    }
  }
}

function mergeChildren(doc, path, over) {
  for (const [rawKey, value] of Object.entries(over)) {
    const suffix = rawKey.match(/^(.*)_(append|prepend)$/);

    // 3 & 4：列表的追加/前插
    if (suffix) {
      const [, target, where] = suffix;
      const tpath = [...path, target];
      const items = Array.isArray(value) ? value : [value];
      const node = doc.getIn(tpath, true);
      if (isSeq(node)) {
        const nodes = items.map((i) => doc.createNode(i));
        if (where === 'prepend') node.items.unshift(...nodes);
        else node.items.push(...nodes);
      } else {
        doc.setIn(tpath, items);
      }
      continue;
    }

    const cpath = [...path, rawKey];

    // 1：对象递归
    if (isPlainObject(value)) {
      mergeChildren(doc, cpath, value);
      continue;
    }

    // 2：具名列表按 name 合并
    if (NAMED_LIST_KEYS.has(rawKey) && Array.isArray(value)) {
      mergeNamedList(doc, cpath, value);
      continue;
    }

    // 其余：直接覆盖
    doc.setIn(cpath, value);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k?.startsWith('--')) throw new Error(`无法识别的参数：${k}`);
    args[k.slice(2)] = argv[i + 1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseSrc = args.base ?? 'clash-cfg.yml';
  const overlaySrc = args.overlay ?? 'overlay.yml';
  const outPath = args.out;

  const baseDoc = parseDocument(await loadText(baseSrc));
  if (baseDoc.errors?.length) {
    throw new Error(`基线配置解析失败：${baseDoc.errors[0].message}`);
  }

  const overlayDoc = parseDocument(await loadText(overlaySrc));
  if (overlayDoc.errors?.length) {
    throw new Error(`overlay 解析失败：${overlayDoc.errors[0].message}`);
  }
  const overlay = overlayDoc.toJSON() ?? {};

  mergeChildren(baseDoc, [], overlay);

  // lineWidth: 0 关掉默认的 80 列折行，长 URL 保持一行，便于人读
  const result = baseDoc.toString({ lineWidth: 0 });
  if (outPath) {
    await writeFile(outPath, result, 'utf8');
    console.error(`已写出 ${outPath}`);
  } else {
    process.stdout.write(result);
  }
}

main().catch((err) => {
  console.error(`合并失败：${err.message}`);
  process.exit(1);
});
