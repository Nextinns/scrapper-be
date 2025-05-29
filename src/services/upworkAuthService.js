// src/services/upworkAuthService.js
const { launchBrowser, closeBrowser, sleep } = require('../utils/puppeteerUtils');


const loginAccount = async (email, password, securityAnswer) => {
  let browser;
  let page;
  console.log(`Attempting to log in user: ${email}`);

  // Determine headless mode from environment variable, default to true
  const isHeadless = process.env.PUPPETEER_HEADLESS !== 'false';

  try {
    ({ browser, page } = await launchBrowser({ isHeadless }));

    console.log(`Navigating to Upwork login for ${email}...`);
    const navigationPromise = page.waitForNavigation();
    await page.goto("https://www.upwork.com/ab/account-security/login", {
      timeout: 0, // 60 seconds timeout
      waitUntil: "domcontentloaded",
    });
    await sleep(3000); // Wait for page to settle

    await page.goto("https://www.upwork.com/ab/account-security/login", {
      timeout: 0,
      waitUntil: "domcontentloaded",
    });
    await sleep(3000);
    await page.waitForSelector('input[type="text"]');
    await page.type('input[type="text"]', email, { delay: 20 });
    await sleep(1000);
    await page.keyboard.press("Enter");
    await navigationPromise;
    await sleep(2000);
    var input = await page.waitForSelector("input[type=password]", {
      visible: true,
      timeout: 0,
    });
    await input.focus();
    await page.type('input[type="password"]', password, { delay: 20 });
    await sleep(1000);
    await page.keyboard.press("Enter");
    await navigationPromise;
    await sleep(10000);
    console.log("Password Done");

    if (await page.$('input[type="password"]')) {
      var security = await page.waitForSelector("input[type=password]", {
        visible: true,
        timeout: 0,
      });
      await security.focus();
      await page.type('input[type="password"]', securityAnswer, { delay: 200 });
      await sleep(1000);
      await page.keyboard.press("Enter");
      await navigationPromise;
    }
    console.log("login success");
    await sleep(2000);


    let cookies = await page.cookies();
    let authTokenCookie =
      cookies.find((cookie) => cookie.name === "oauth2_global_js_token") ||
      cookies.find((cookie) => cookie.name === "asct_vt");

    if (!authTokenCookie) {
      console.warn(`Auth token not found initially for ${email}. Reloading page...`);
      await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"], timeout: 60000 });
      await sleep(15000); // Wait significantly after reload
      cookies = await page.cookies(); // Re-fetch cookies
      authTokenCookie =
        cookies.find((cookie) => cookie.name === "oauth2_global_js_token") ||
        cookies.find((cookie) => cookie.name === "asct_vt");

      if (!authTokenCookie) {
        console.error(`Auth token still not found after reload for ${email}.`);
      }
    }

    console.log(`Successfully retrieved session data for ${email}.`);
    return {
      cookies: cookies,
      upworkAuthToken: authTokenCookie?.value || null,
    };

  } catch (err) {
    console.error(`ERROR logging in user ${email}:`, err.message);
    // For debugging, you might want to take a screenshot on error
    if (page) {
      const errorScreenshotPath = `error_login_${email.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
      try {
        await page.screenshot({ path: errorScreenshotPath, fullPage: true });
        console.log(`Screenshot taken on error: ${errorScreenshotPath}`);
      } catch (screenshotError) {
        console.error('Failed to take screenshot on error:', screenshotError);
      }
    }
    throw err; // Re-throw to be caught by the caller (e.g., the refresh script)
  } finally {
    console.log(`Closing browser for ${email}...`);
    await closeBrowser(browser);
  }
};

module.exports = {
  loginAccount,
};
