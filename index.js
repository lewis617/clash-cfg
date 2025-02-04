import { parse, stringify } from 'yaml';
import fs from 'fs/promises';

async function fetchClashSubscriptionLinks() {
  const url = 'https://raw.githubusercontent.com/clashfree/clashfree.github.io/refs/heads/main/README.md';
  const additionalLink = 'https://raw.githubusercontent.com/ripaojiedian/freenode/main/clash';
  
  try {
    const response = await fetch(url);
    const text = await response.text();
    
    const sectionRegex = /### Clash订阅链接[\s\S]*?(?=###|$)/;
    const section = text.match(sectionRegex);
    
    let links = [];
    
    if (section) {
      const linkRegex = /https?:\/\/[^\s)]+/g;
      links = section[0].match(linkRegex) || [];
    }
    
    links.push(additionalLink);
    
    if (links.length > 0) {
      console.log('找到的 Clash 订阅链接：');
      links.forEach(link => console.log(link));
    } else {
      console.log('没有找到任何 Clash 订阅链接。');
    }
    
    return links;
  } catch (error) {
    console.error('获取或解析内容时出错：', error);
    return [additionalLink];
  }
}

async function fetchAndParseProxies(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const config = parse(text);
    return config?.proxies || [];
  } catch (error) {
    console.error(`获取或解析 ${url} 时出错：`, error);
    return [];
  }
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

  // 过滤代理
  let filteredProxies = allProxies.filter(proxy => {
    // 过滤掉 cipher 为 'ss' 或 type 为 'vless' 的代理
    if (proxy.cipher === 'ss' || proxy.type === 'vless') {
      return false;
    }
    // 过滤掉 type 为 vmess 且没有 alterId 的节点
    if (proxy.type === 'vmess' && (proxy.alterId === undefined || proxy.alterId === null)) {
      return false;
    }
    return true;
  });

  console.log(`过滤后剩余 ${filteredProxies.length} 个代理`);

  // 按 server 去重
  const uniqueProxies = [];
  const seenServers = new Set();
  for (const proxy of filteredProxies) {
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
    const content = await fs.readFile('clash-provider.yml', 'utf8');
    const config = parse(content);
    
    // 更新 proxies
    config.proxies = proxies;
    
    // 将更新后的配置写回文件
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
  console.log('过滤和去重后的代理：', proxies);
  
  // 更新 clash-provider.yml
  await updateClashProviderYml(proxies);
})();

export { fetchClashSubscriptionLinks, getAllProxies };