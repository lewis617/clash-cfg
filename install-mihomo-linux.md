```bash
wget https://github.com/MetaCubeX/mihomo/releases/download/v1.19.10/mihomo-linux-arm64-v1.19.10.deb

sudo dpkg -i mihomo-linux-arm64-v1.19.10.deb

curl -o ~/.config/mihomo/config.yaml https://raw.githubusercontent.com/lewis617/clash-cfg/main/clash-cfg.yml

sudo nano /etc/systemd/system/mihomo.service

sudo systemctl daemon-reload
sudo systemctl start mihomo
```

如果您希望 Mihomo 在系统启动时自动启动，可以使用以下命令启用服务：

```bash
sudo systemctl enable mihomo
```


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
配置网络
```bash
nano /etc/netplan/armbian-default.yaml 
```

```yaml
network:
  version: 2
  renderer: NetworkManager
  ethernets:
    eth0:
      addresses:
        - 192.168.28.3/24
      nameservers:
        addresses:
          - 192.168.28.1
          - 80.80.80.80
          - 8.8.8.8
      routes:
        - to: 0.0.0.0/0
          via: 192.168.28.1
```
