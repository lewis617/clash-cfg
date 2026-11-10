import { parse, stringify } from 'yaml';
import fs from 'fs/promises';

async function fetchClashSubscriptionLinks() {
  const sources = [
    // 注释里的两个数字 = 2026-11-10 在本机实测的「进入清单的节点数 → 整轮体检中成功过的节点数」。
    // 判据只看有没有产出：一个源都不留会掉几个可用节点，但清单越小，
    // 一轮体检（节点数 × 测速 URL 数 ÷ 10 并发）越快 —— 所以零产出的源纯属拖累。
    'https://raw.githubusercontent.com/snakem982/proxypool/main/source/clash-meta-2.yaml',           // 18 → 5 活
    'https://raw.githubusercontent.com/ermaozi01/free_clash_vpn/main/subscribe/clash.yml',            // 19 → 15 活，最稳的源
    'https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list.yml',                          // 106 → 10 活，量大但大部分是死的
    'https://raw.githubusercontent.com/free-nodes/clashfree/refs/heads/main/README.md',               // 43 → 2 活（README 里指向当天的 yml）
    // 2026-11-10 移除：
    //   Barabama/FreeNodes 的 cfmem / clashstair / datiya —— feat/ai-crawler-v2 分支已被删，
    //     三个 URL 全 404（文件迁到了默认分支 main，但 main 的 clashnode.yaml 一次带进 461 个
    //     新 server，会把一轮体检从 ~6 分钟拉到 ~15 分钟，且该仓库历史存活率约 1/170，不接回来）
    //   ripaojiedian/freenode —— 15 个节点进清单，三轮体检 0 存活
    // 2026-09-24 移除（采样 0 存活）：YFTree/ClashNodes (0/110, 全是 yoyapai)、
    //   mahdibland/ShadowsocksAggregator (0/80)、anaer/Sub (0/80)、Barabama main 分支 (1/170)
  ];
  
  let links = [];

  for (const url of sources) {
    try {
      if (url.endsWith('README.md')) {
        const response = await fetch(url);
        const text = await response.text();
        // 提取 .yaml 或 .yml 链接
        const yamlRegex = /https?:\/\/[^\s)]+\.(?:yaml|yml)/g;
        let foundLinks = text.match(yamlRegex) || [];
        
        // 转换为 raw 链接
        foundLinks = foundLinks.map(link => {
          if (link.includes('github.com') && link.includes('/blob/')) {
            return link.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
          }
          return link;
        });
        links.push(...foundLinks);
      } else {
        links.push(url);
      }
    } catch (error) {
      console.error(`获取或解析 ${url} 时出错：`, error);
    }
  }

  // 去重
  links = [...new Set(links)];

  if (links.length > 0) {
    console.log('找到的 Clash 订阅链接：');
    links.forEach(link => console.log(link));
  } else {
    console.log('没有找到任何 Clash 订阅链接。');
  }
  
  return links;
}

async function fetchAndParseProxies(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      const config = parse(text);
      const proxies = config?.proxies || [];
      if (proxies.length === 0 && attempt < retries) {
        console.warn(`第 ${attempt} 次获取 ${url} 代理为空，${attempt < retries ? '10秒后重试...' : '放弃'}`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      return proxies;
    } catch (error) {
      console.error(`第 ${attempt} 次获取 ${url} 时出错：`, error.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
    }
  }
  return [];
}

async function getAllProxies() {
  const subscriptionLinks = await fetchClashSubscriptionLinks();
  let allProxies = [];

  for (const link of subscriptionLinks) {
    console.log(`正在获取 ${link} 的代理...`);
    const proxies = await fetchAndParseProxies(link);
    allProxies = allProxies.concat(proxies);
    console.log(`从 ${link} 获取到 ${proxies.length} 个代理`);
  }

  console.log(`总共获取到 ${allProxies.length} 个代理`);

  // 按 server 去重
  const uniqueProxies = [];
  const seenServers = new Set();
  for (const proxy of allProxies) {
    if (proxy.server && !seenServers.has(proxy.server)) {
      uniqueProxies.push(proxy);
      seenServers.add(proxy.server);
    }
  }

  console.log(`去重后剩余 ${uniqueProxies.length} 个代理`);
  return uniqueProxies;
}

async function updateClashProviderYml(proxies) {
  try {
    const config = { proxies };
    const updatedContent = stringify(config);
    await fs.writeFile('clash-provider.yml', updatedContent, 'utf8');

    console.log('成功更新 clash-provider.yml');
  } catch (error) {
    console.error('更新 clash-provider.yml 时出错：', error);
  }
}

// 立即调用异步函数
(async () => {
  const proxies = await getAllProxies();
  
  // 更新 clash-provider.yml
  await updateClashProviderYml(proxies);
})();

export { fetchClashSubscriptionLinks, getAllProxies };
