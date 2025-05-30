// src/services/puppeteerScraperManager.js
// const puppeteerUtils = require('../utils/puppeteerUtils'); // This will now refer to your enhanced utils
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const randomUseragent = require("random-useragent");
puppeteer.use(StealthPlugin());


const activeBrowserInstances = new Map(); // Key: accountEmail, Value: { browser, page }

const getOrCreateBrowserInstance = async (accountEmail, cookies) => {

  const instance = activeBrowserInstances.get(accountEmail);

  const args = [
    "--no-sandbox",
    // "--headless=new",
    "--disable-setuid-sandbox"
  ];

  const browser = await puppeteer.launch({
    executablePath: puppeteer.executablePath(),
    headless: true,
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
  await page.setUserAgent(randomUseragent.getRandom());

  if (instance) {
    const { browser, page } = instance;

    // Reuse existing instance if the browser is connected and page is open
    if (browser.isConnected() && page && !page.isClosed()) {
      console.log(`Reusing existing browser instance for ${accountEmail}`);

      await refreshCookies(page, cookies);
      await page.goto('https://www.upwork.com/nx/find-work', { timeout: 0, waitUntil: ["networkidle0", "domcontentloaded"] });
      return instance;
    }

    console.log(`Existing instance for ${accountEmail} is invalid. Recreating...`);
    await closeBrowserInstance(accountEmail); // Ensure old one is closed
  }

  // Create a new browser instance
  console.log(`Creating new browser instance for ${accountEmail}...`);

  // const { browser, page } = await puppeteerUtils.launchBrowser({ isHeadless });
  console.log(`Launched new browser for ${accountEmail}`);


  if (cookies && cookies.length > 0) {
    console.log(`Setting cookies for ${accountEmail}:`, cookies);

    await page.goto('https://www.upwork.com/nx/find-work', { timeout: 0, waitUntil: ["domcontentloaded"] });
    await page.setCookie(...cookies);
    console.log(`Set initial cookies for new page for ${accountEmail}`);
  } else {
    console.log(`No cookies provided for ${accountEmail}`);
  }

  console.log(`Navigating to Upwork find-work page for ${accountEmail}...`);

  await page.goto('https://www.upwork.com/nx/find-work', { timeout: 0, waitUntil: ["networkidle0", "domcontentloaded"] });
  console.log(`Navigated to Upwork find-work page for ${accountEmail}`);

  activeBrowserInstances.set(accountEmail, { browser, page });
  return { browser, page, jobId: "" };
};

const refreshCookies = async (page, newCookies) => {
  try {
    const existingCookies = await page.cookies('https://www.upwork.com/nx/find-work');
    if (existingCookies.length > 0) {
      await page.deleteCookie(...existingCookies); // Clear existing cookies
    }
    console.log('Cleared existing Upwork cookies from page.');

    if (newCookies && newCookies.length > 0) {
      await page.setCookie(...newCookies); // Set new cookies
      console.log('Set new cookies on page.');
    }
  } catch (error) {
    console.error('Error refreshing cookies:', error);
  }
};

const refreshPageSession = async (page, newCookies) => {
  if (!page || page.isClosed()) {
    throw new Error('Page is closed or invalid, cannot refresh session.');
  }

  await page.goto('https://www.upwork.com/nx/find-work', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await refreshCookies(page, newCookies);

  await page.goto('https://www.upwork.com/nx/find-work', { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('Page session refreshed.');
  return page;
};

const closeBrowserInstance = async (accountEmail) => {
  if (activeBrowserInstances.has(accountEmail)) {
    const { browser } = activeBrowserInstances.get(accountEmail);
    console.log(`Closing browser instance for ${accountEmail}...`);
    await puppeteerUtils.closeBrowser(browser);
    activeBrowserInstances.delete(accountEmail);
  }
};

const closeAllBrowserInstances = async () => {
  console.log('Closing all active browser instances...');
  const closingPromises = Array.from(activeBrowserInstances.keys()).map(accountEmail => closeBrowserInstance(accountEmail));
  await Promise.all(closingPromises);
  console.log('All browser instances closed.');
};

module.exports = {
  getOrCreateBrowserInstance,
  refreshPageSession,
  closeBrowserInstance,
  closeAllBrowserInstances,
};
