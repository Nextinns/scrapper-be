const UpworkAccount = require('../models/UpworkAccount');

const { executablePath } = require("puppeteer");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());


exports.loginAccount = async (email, password, securityAnswer) => {
    try {
        console.log("LOGGING user", email);
        upworkLoginBrowser = await puppeteer.launch({

            executablePath: executablePath(),
            devtools: false,
            headless: true,
            headless: false,
            defaultViewport: null,
            ignoreHTTPSErrors: true,
            args: [
                "--no-sandbox",
                "--headless=new",
                "--disable-setuid-sandbox",
                "--ignore-certificate-errors",
                "--disable-dev-shm-usage",
                "--enable-features=ChromeBrowserCloudManagement",
                "--disabled-setupid-sandbox",
                "--incognito",
                "--disable-dev-shm-usage",
                "--enable-chrome-browser-cloud-management",
            ],
        });
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

        page = await upworkLoginBrowser.newPage();
        const navigationPromise = page.waitForNavigation();
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

        var cookies = await page.cookies();
        var token =
            cookies.find((cookie) => cookie.name == "oauth2_global_js_token") ||
            cookies.find((cookie) => cookie.name == "asct_vt");

        if (!token) {
            page.reload();
            await sleep(20000);
            cookies = await page.cookies();
            token =
                cookies.find((cookie) => cookie.name == "oauth2_global_js_token") ||
                cookies.find((cookie) => cookie.name == "asct_vt");
        }

        try {
            const account = new UpworkAccount({
                email: email,
                upworkAuthToken: token?.value,
                cookies: cookies,
            });
            await account.save();
            console.log("Account data saved to MongoDB");
        } catch (error) {
            console.error("Error saving account:", error);
        }
        await sleep(10000);
        if (page) await page.close();
        if (upworkLoginBrowser) await closeBrowserInstance(upworkLoginBrowser);
    } catch (err) {
        console.log("ERROR logining user", err);

        if (page) await page.close();
        if (upworkLoginBrowser) await closeBrowserInstance(upworkLoginBrowser);
    }
};

const closeBrowserInstance = async (scraperInstance) => {
    const childProcess = scraperInstance?.process();
    if (childProcess) {
      childProcess.kill();
      console.log("Browser process terminated.");
    }
    await scraperInstance.close();
  };