# clash-cfg

mihomo 配置模板 + 免费节点抓取脚本。抓取由 GitHub Actions 每天两次（UTC 6:00 / 18:00，北京 14:00 / 02:00）执行，产物推到 `provider` 分支。

## 节点产物（`provider` 分支）

```
https://gh-proxy.com/https://raw.githubusercontent.com/lewis617/clash-cfg/provider/clash-provider.yml
https://testingcf.jsdelivr.net/gh/lewis617/clash-cfg@provider/clash-provider.yml
https://raw.githubusercontent.com/lewis617/clash-cfg/refs/heads/provider/clash-provider.yml
```

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

## 本地私有层（用 merge.js 叠加，不进仓库）

这个仓库是公开的，私有的分组和规则不能放进来。做法是：**仓库只提供模板**，本机放一份私有 overlay，用 `merge.js` 合成完整的 `config.yaml`。

```bash
npm install                                          # 只依赖 yaml
cp overlay.example.yml ~/.config/mihomo/local/overlay.yml   # 然后按需改
node merge.js --base clash-cfg.yml \
              --overlay ~/.config/mihomo/local/overlay.yml \
              --out ~/.config/mihomo/config.yaml
```

`--base` 也可以直接给仓库地址，这样每次合并都顺手拿到上游更新：

```bash
node merge.js --base https://gh-proxy.com/https://raw.githubusercontent.com/lewis617/clash-cfg/main/clash-cfg.yml \
              --overlay ~/.config/mihomo/local/overlay.yml \
              --out ~/.config/mihomo/config.yaml
```

### overlay 的语义

| 写法 | 含义 |
| --- | --- |
| `key: 值`、嵌套对象 | 递归覆盖同路径的值 |
| `proxies` / `proxy-groups` / `proxy-providers` / `rule-providers` / `listeners` / `tunnels` | 按 `name` 合并：同名整项覆盖，新名字追加到末尾 |
| `rules_prepend: [...]` | 插到 `rules` 最前面 |
| `rules_append: [...]` | 接在 `rules` 末尾 |
| 任意列表的 `xxx_append` / `xxx_prepend` | 在任意层级追加 / 前插，例如 `dns: { fake-ip-filter_append: [...] }` |

合并**只增不减**：模板里的内容不会被删掉，除非 overlay 显式覆盖同名键。没被 overlay 触碰的段落（含注释）原样保留。

### 私有域名要同时进 fake-ip 白名单

whitelist 模式下只有白名单里的域名会拿到假地址。只加规则不加白名单，DNS 会返回真实 IP，流量根本不过本机：

```yaml
# overlay.yml
dns:
  fake-ip-filter_append:
    - 'rule-set:MY-DOMAINS'
rule-providers:
  MY-DOMAINS:
    type: file
    behavior: domain
    format: yaml
    path: ./ruleset/local-domains.yml   # 本机私有文件
```

`behavior: classical` 的 provider 在规则里引用时**必须带 target**（`RULE-SET,local-rules,PROXY`），不带会报 `proxy [local-rules] not found`。

## 更新线上配置时的注意事项

不要用 `curl -o` 把 `clash-cfg.yml` 直接覆盖到 `~/.config/mihomo/config.yaml`。线上配置驱动着全屋翻墙（路由器上有一条 `198.18.0.0/16` 静态路由指向 mihomo 所在机器），而且需要叠加私有 overlay。正确流程：

1. `node merge.js ...` 合成新配置到临时文件
2. `mihomo -t -d <配置目录> -f <临时文件>` 校验
3. 备份旧的 `config.yaml`，再替换
4. `curl -X PUT 'http://127.0.0.1:9090/configs?force=true' -d '{"path":"<配置文件>","payload":""}'` 热重载（返回 204，不断连接）

