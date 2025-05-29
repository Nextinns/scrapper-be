const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const userAgent = require('user-agents');

// Enable Stealth Plugin to avoid bot detection
puppeteer.use(StealthPlugin());

const launchBrowser = async ({ isHeadless = false, proxyServer = null } = {}) => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--ignore-certificate-errors',
    '--incognito', 
    '--disable-web-security', 
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
      defaultViewport: null,
      ignoreHTTPSErrors: true,
      args: args,
      protocolTimeout: 2400000
    });

    const page = await browser.newPage();
    await setupPage(page);

    return { browser, page };
  } catch (error) {
    console.error('Error launching Puppeteer browser:', error);
    throw error;
  }
};

const setupPage = async (page) => {
  // Rotate User-Agent for each session
  const randomUserAgent = new userAgent();
  await page.setUserAgent(randomUserAgent.toString());

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
