const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const randomUseragent = require("random-useragent");
puppeteer.use(StealthPlugin());

const launchBrowser = async ({ isHeadless = false, proxyServer = null } = {}) => {
  const args = [
    "--no-sandbox",
    // "--headless=new",
    "--disable-setuid-sandbox"
  ];

  if (proxyServer) {
    args.push(`--proxy-server=${proxyServer}`);
  }

  // Determine headless mode
  const headlessMode = isHeadless === false ? false : 'new';

  try {
    const browser = await puppeteer.launch({
      executablePath: puppeteer.executablePath(),
      headless: headlessMode,
      devtools: false,
      defaultViewport: {
        width: 1440,
        height: 1080,
    },      
      ignoreHTTPSErrors: true,
      args: args,
      protocolTimeout: 2400000
    });

    const page = await browser.newPage();
    // await page.setUserAgent(randomUseragent.getRandom());
    await setupPage(page);

    return { browser, page };
  } catch (error) {
    console.error('Error launching Puppeteer browser:', error);
    throw error;
  }
};

const setupPage = async (page) => {

  await page.setUserAgent(randomUseragent.getRandom());

  // Avoid Cloudflare and other bot checks
  await page.evaluateOnNewDocument(() => {
    // Modify navigator object to simulate real user behavior
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  await sleep(3000); // Initial sleep to allow the browser to stabilize
};

const closeBrowser = async (browser) => {
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      console.error('Error closing Puppeteer browser:', error);
    }
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  launchBrowser,
  closeBrowser,
  sleep,
};
