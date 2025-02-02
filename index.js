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
    
    // 添加新的订阅链接
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
    return [additionalLink]; // 即使出错，也至少返回新添加的链接
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
  const filteredProxies = allProxies.filter(proxy => {
    return !(proxy.cipher === 'ss' || proxy.type === 'vless');
  });

  console.log(`过滤后剩余 ${filteredProxies.length} 个代理`);
  return filteredProxies;
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
  console.log('过滤后的代理：', proxies);
  
  // 更新 clash-provider.yml
  await updateClashProviderYml(proxies);
})();

export { fetchClashSubscriptionLinks, getAllProxies };