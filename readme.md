# clash-cfg

mihomo 配置模板。节点不再由本仓库抓取汇总：`clash-cfg.yml` 里直接声明了三个上游的 `proxy-providers`（都是固定链接），mihomo 自己按 `interval: 21600` 去拉。

**为什么去掉 GitHub Actions**（2026-11-10）：原来的做法是 Action 每 12 小时把几个上游源抓下来、按 `server` 去重、推到 `provider` 分支，mihomo 再拉那一份合成文件（经 jsDelivr / gh-proxy 镜像）。问题有两个：① 仓库 60 天无活动后 GitHub 会自动停用 scheduled workflow，一旦静默停掉，合成文件就永久卡在旧节点上，节点慢慢全死；② 多了一层要维护的产物（分支 + CDN 缓存 purge）。改成直连上游后，每个源各有自己的体检队列（并发各 10 条），一轮体检反而更快。

上游源（每个后面是 2026-11-10 的实测产出「节点数 → 体检存活」）：

| provider | 链接 | 产出 |
|---|---|---|
| `ermaozi01` | `ermaozi01/free_clash_vpn/main/subscribe/clash.yml` | 22 → 12，最稳 |
| `snakem982` | `snakem982/proxypool/main/source/clash-meta-2.yaml` | 62 → 10 |
| `peasoft` | `peasoft/NoMoreWalls/master/list.yml` | 125 → 10，量大但多数是死的 |

已被移除的源：Barabama/FreeNodes 的 cfmem / clashstair / datiya（`feat/ai-crawler-v2` 分支已删，全 404）、ripaojiedian/freenode（0 存活）、free-nodes/clashfree（**唯一没有固定链接的源**：文件按 `clashYYYYMMDD.yml` 每天换名，`sub.yml` 是 0 字节空文件，只能靠解析 README 取当天链接——为它单独养一个定时任务不值得，代价约 1 个可用节点）。

如果以后要加源，直接往 `proxy-providers` 里加一段（`health-check` 块不能省，否则定时体检的 ticker 不会启动），组里的 `include-all: true` 会自动收进来。

## mihomo 配置（`main` 分支）

```
https://gh-proxy.com/https://raw.githubusercontent.com/lewis617/clash-cfg/main/clash-cfg.yml
https://testingcf.jsdelivr.net/gh/lewis617/clash-cfg/clash-cfg.yml
https://raw.githubusercontent.com/lewis617/clash-cfg/refs/heads/main/clash-cfg.yml
```

三个地址内容相同，只是镜像不同：`gh-proxy.com` 是当前主机上实际在用的，jsdelivr 有缓存延迟，raw.githubusercontent 国内直连不稳。

## 自定义清单

`ruleset/custom-proxy.yml` 和 `ruleset/custom-direct.yml` 由 mihomo 的 `rule-providers` 每天拉一次。

**注意**：`custom-proxy.yml` 里的域名会自动进入 fake-ip 白名单（配置里的 `fake-ip-filter: rule-set:custom-proxy`），也就是说**往这个文件里加域名，就等于让它走代理**，不需要再改 `clash-cfg.yml`。

## 本地私有层（不放进本仓库）

这个仓库是公开的，私有的分组和规则不能放进来。分三层，**能用 mihomo 自带机制的就用自带机制**：

| 层 | 放什么 | 载体 |
| --- | --- | --- |
| ① 仓库模板 `clash-cfg.yml` | 公开的端口/DNS/分组/规则骨架 | 版本控制 |
| ② 私有内容 | 私有规则、geosite 覆盖不到的自建域名 | **mihomo 原生 `type: file` rule-provider**（`ruleset/local-*.yml`，不进仓库）+ `GeoSite.dat` 里的公开清单 |
| ③ 私有声明 | 私有 `proxy-groups`、对本地 provider / geosite 的引用 | 本机 `overlay.yml`，用 `merge.js` 合成 |

之所以要第三层：`proxy-groups` **无法外置**（mihomo 没有 config include/merge，分组只能写在 config 里）。除了分组和几行引用，其余全部交给原生机制，所以**日常加私有域名/规则根本不用重新合并**。

> **清单类优先用 `geosite:`**。mihomo 自带 `GeoSite.dat`（v2fly domain-list-community 的编译产物），`geosite:gfw` / `geosite:category-porn` 这样一行就顶几千条域名，还自动跟着版本更新。
> 自己维护一份域名文件只在两种情况下值得：geosite 里没有的自建/冷门域名；或者需要一份 geosite 不覆盖的个性化清单。


```bash
# 首次
npm install                                                 # 只依赖 yaml
cp overlay.example.yml ~/.config/mihomo/local/overlay.yml    # 按需改
node merge.js --base clash-cfg.yml \
              --overlay ~/.config/mihomo/local/overlay.yml \
              --out ~/.config/mihomo/config.yaml

# 之后改私有域名/规则，只需要让 mihomo 重读 provider（不用重新合并）
curl -X PUT http://127.0.0.1:9090/providers/rules/local-domains
curl -X PUT http://127.0.0.1:9090/providers/rules/local-rules
```

`--base` 也可以直接给仓库地址，这样每次合并顺手拿到上游更新：

```bash
node merge.js --base https://gh-proxy.com/https://raw.githubusercontent.com/lewis617/clash-cfg/main/clash-cfg.yml \
              --overlay ~/.config/mihomo/local/overlay.yml \
              --out ~/.config/mihomo/config.yaml
```

### 私有内容：file provider

```yaml
# ruleset/local-rules.yml     （behavior: classical，可写任意规则类型）
payload:
  - 'DOMAIN-SUFFIX,example.net,DIRECT'
  - 'GEOSITE,category-xxx,MY-NODES'

# ruleset/local-domains.yml   （behavior: domain，只在 geosite 覆盖不到时才需要）
payload:
  - '+.my-nas.internal'      # 进入 fake-ip 白名单，流量才会被路由到 mihomo
```

`type: file` 的 provider 改完不用重启：`PUT /providers/rules/<name>` 就会重新读盘（已验证返回 204 且立刻生效）。

### 私有声明：overlay 的语义

| 写法 | 含义 |
| --- | --- |
| `key: 值`、嵌套对象 | 递归覆盖同路径的值 |
| `proxies` / `proxy-groups` / `proxy-providers` / `rule-providers` / `listeners` / `tunnels` | 按 `name` 合并：同名整项覆盖，新名字追加到末尾 |
| `rules_prepend: [...]` | 插到 `rules` 最前面 |
| `rules_append: [...]` | 接在 `rules` 末尾 |
| 任意列表的 `xxx_append` / `xxx_prepend` | 在任意层级追加 / 前插，例如 `dns: { fake-ip-filter_append: [...] }` |

合并**只增不减**：模板里的内容不会被删掉，除非 overlay 显式覆盖同名键。没被 overlay 触碰的段落（含注释）原样保留。

### 两个必须记住的细节

- **要代理的域名得先进 fake-ip 白名单**：whitelist 模式下只有白名单里的域名拿到假地址。用 `geosite:xxx` 或 `rule-set:xxx` 追加（`dns.fake-ip-filter_append`）。只加规则不加白名单，DNS 返回真实 IP，流量根本不过 mihomo——规则写得再对也不会命中。
- `behavior: classical` 的 provider 在规则里引用时**必须带 target**：`RULE-SET,local-rules,MY-NODES`，不带会报 `proxy [local-rules] not found`。

## 更新线上配置时的注意事项

不要用 `curl -o` 把 `clash-cfg.yml` 直接覆盖到 `~/.config/mihomo/config.yaml`。线上配置驱动着全屋翻墙（路由器上有一条 `198.18.0.0/16` 静态路由指向 mihomo 所在机器），而且需要叠加私有 overlay。正确流程：

1. `node merge.js ...` 合成新配置到临时文件
2. `mihomo -t -d <配置目录> -f <临时文件>` 校验
3. 备份旧的 `config.yaml`，再替换
4. `curl -X PUT 'http://127.0.0.1:9090/configs?force=true' -d '{"path":"<配置文件>","payload":""}'` 热重载（返回 204，不断连接）


