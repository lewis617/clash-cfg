# 在 Linux（Armbian / aarch64）上安装 mihomo

## 1. 安装 mihomo

```bash
wget https://github.com/MetaCubeX/mihomo/releases/download/v1.19.10/mihomo-linux-arm64-v1.19.10.deb

sudo dpkg -i mihomo-linux-arm64-v1.19.10.deb
```

> 注意：不要用 `curl -o ~/.config/mihomo/config.yaml <仓库地址>` 的方式拉配置。
> 线上配置是本机维护的版本，跟仓库里可能不一致，覆盖前先备份。
> 需要拉的话先 `cp config.yaml config.yaml.bak`，再比对 fake-ip 相关段落。

## 2. 配置 systemd 服务

`/etc/systemd/system/mihomo.service`：

```ini
[Unit]
Description=Mihomo Service
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/mihomo
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl start mihomo
sudo systemctl enable mihomo
```

## 3. 配置网络（netplan）

本机地址 `192.168.1.104`，网关和 DNS 都指向主路由 `192.168.1.1`（不要在网卡上配公共 DNS，
本机自己的解析经网关转发到 mihomo 的 1053 端口）：

```yaml
network:
  version: 2
  renderer: NetworkManager
  ethernets:
    eth0:
      addresses:
        - 192.168.1.104/24
      nameservers:
        addresses:
          - 192.168.1.1
      routes:
        - to: 0.0.0.0/0
          via: 192.168.1.1
```

## 4. 局域网 fake-ip 引流（可选）

如果主路由把 `198.18.0.0/16` 路由到本机，需要本机把这段地址的 TCP 转到 mihomo 的
redir-port（7892），否则这些包会没有任何 listener 接住。规则见
`/etc/mihomo/lan-redirect.sh` + `mihomo-lan-redirect.service`（不在本仓库内，
属于本机运维脚本）。

另外：本机 `eth0` 只有百兆，全屋流量都走本机会把网速压到 90M 左右，
所以只引流"被代理的流量"（即 fake-ip 白名单命中的域名），直连流量不经本机。
