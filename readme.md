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

## 本地私有层（不放进本仓库）

这个仓库是公开的，所以**私有的分组和规则不放在这里**，由使用者在自己的机器上用 `type: file` 的 rule-provider 叠加：

```yaml
# 本机 ~/.config/mihomo/config.yaml
rule-providers:
  local-rules:                      # 私有规则（可含自定义分组规则）
    type: file
    behavior: classical
    path: ./ruleset/local-rules.yml
    format: yaml
  local-domains:                    # 私有域名（自动进 fake-ip 白名单）
    type: file
    behavior: domain
    path: ./ruleset/local-domains.yml
    format: yaml

dns:
  fake-ip-filter-mode: whitelist
  fake-ip-filter:
    - 'geosite:gfw'
    - 'geosite:github'
    - 'rule-set:custom-proxy'
    - 'rule-set:local-domains'      # 私有域名也拿假地址

rules:
  - RULE-SET,local-rules,PROXY      # 注意：classical 型必须带 target
  - RULE-SET,custom-proxy,PROXY
  # ... 本仓库的规则
```

`./ruleset/local-*.yml` 属于本机私有文件，不在版本控制里。

**私有的 `proxy-groups` 无法外置**——mihomo 没有 config include/merge 机制，分组只能写在 `config.yaml` 里。所以本机的 `config.yaml` 会比本仓库的 `clash-cfg.yml` 多出若干个分组，属预期，不要用整文件覆盖的方式同步。

## 更新线上配置时的注意事项

不要把 `clash-cfg.yml` 直接 `curl -o` 覆盖到 `~/.config/mihomo/config.yaml`。线上配置驱动着全屋翻墙（4a 上有一条 `198.18.0.0/16` 静态路由指向本机），而且包含本仓库没有的私有分组；覆盖前先备份，并确认 fake-ip 相关段落没被回退成旧版本。
