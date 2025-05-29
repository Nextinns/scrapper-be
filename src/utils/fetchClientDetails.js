const JobPosting = require('../models/JobPosting');

const { executablePath } = require("puppeteer");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const minDelay = 10000;
const maxDelay = 30000;
let browser;
var browserInstances = {};

async function fetchAndSaveData(jobId, authToken, cookies, email) {
    const browserInstance = browserInstances[email];
    if (!browserInstance) {
        await createBrowserInstance(email, cookies);
        return;
    }
    
    let gqlToken = cookies?.find((cookie) => cookie.path == "/nx/create-profile");
    console.log("gqlToken", gqlToken);

    try {
        if (browserInstances[email] !== "fetching") {
            const { page, browser } = browserInstance;
            closeBrowserAfterTimeout(browser, 10, browserInstances, email);
            if (page && cookies) await page.setCookie(...cookies);

            if (jobId && authToken) {
                console.log("Extracted Job ID:", jobId, authToken);
                let newJobId = jobId[0] == "~" ? jobId.slice(3) : jobId.slice(2);
                await page.screenshot({ path: "test.png" });
                const data = await page.evaluate(
                    async (jobId, authToken, newJobId, gqlToken) => {
                        let result = {};

                        const fetchData = async (url, authToken) => {
                            // try {
                            const response = await fetch(url, {
                                headers: {
                                    accept: "application/json, text/plain, */*",
                                    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
                                    authorization: `Bearer ${authToken}`,
                                    "cache-control": "no-cache",
                                    pragma: "no-cache",
                                    priority: "u=1, i",
                                    "sec-ch-viewport-width": "1440",
                                    "sec-fetch-dest": "empty",
                                    "sec-fetch-mode": "cors",
                                    "sec-fetch-site": "same-origin",
                                    "vnd-eo-parent-span-id":
                                        "71e42d87-db5a-483d-8f60-a2864bc34ad7",
                                    "vnd-eo-span-id": "0fceedd3-4921-4377-9304-5ec338a796b4",
                                    "vnd-eo-trace-id": "5e409ab1-2067-414e-9da5-81cf010ccb67",
                                    "x-odesk-user-agent": "oDesk LM",
                                    "x-requested-with": "XMLHttpRequest",
                                    "x-upwork-accept-language": "en-US",
                                },
                                referrer: `https://www.upwork.com/ab/proposals/job/~${newJobId}/apply/`,
                                referrerPolicy: "origin-when-cross-origin",
                                method: "GET",
                                mode: "cors",
                                credentials: "include",
                            });
                            if (response.ok) {
                                return await response.json();
                            }
                            throw JSON.stringify({
                                code: response.status,
                                message: await response.text(),
                            });
                        };

                        // Fetch job details
                        const jobDetailsUrl = `https://www.upwork.com/ab/proposals/api/openings/${newJobId}`;
                        const jobDetails = await fetchData(jobDetailsUrl, authToken);

                        if (jobDetails?.opening) {
                            result.user_id = jobDetails.opening.createdByUid;
                            result.org_id = jobDetails.opening.organizationUid;
                            result.opening_api_data = jobDetails;

                            const personDetailsResponse = await fetch(
                                "https://www.upwork.com/api/graphql/v1",
                                {
                                    headers: {
                                        accept: "application/json",
                                        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
                                        authorization: `Bearer ${gqlToken?.value}`,
                                        "content-type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        query: `
            {
              talentProfiles(personIds: [${jobDetails.opening.createdByUid}]) {
                profiles {
                  personalData {
                    portrait {
                      portrait500
                      portrait100
                    }
                    profileUrl
                    firstName
                    lastName
                    title
                  }
                }
              }
            }
          `,
                                        variables: {},
                                    }),
                                    method: "POST",
                                    mode: "cors",
                                    credentials: "include",
                                }
                            );

                            if (!personDetailsResponse.ok) {
                                throw new Error(
                                    `Failed to fetch person details: ${personDetailsResponse.status}`
                                );
                            }

                            const personDetailsData = await personDetailsResponse.json();
                            const profile =
                                personDetailsData?.data?.talentProfiles?.profiles[0]
                                    ?.personalData;
                            // Fetch person details
                            // const personUrl = `https://www.upwork.com/ab/ats-aas/api/profile/${jobDetails.opening.createdByUid}/person`;
                            // const personDetails = await fetchData(personUrl, authToken);

                            result.first_name = profile.firstName;
                            result.last_name = profile.lastName;
                            result.profile_pic =
                                profile.portrait?.portrait500 ||
                                profile.portrait?.portrait100 ||
                                "";

                            // Fetch job details v4
                            const jobDetailsV4Url = `https://www.upwork.com/ab/proposals/api/v4/job/details/${newJobId}`;
                            const jobDetailsV4 = await fetchData(jobDetailsV4Url, authToken);

                            result = {
                                ...result,
                                company_name: jobDetailsV4.jobDetails?.buyer?.info.company.name,
                                company_url: jobDetailsV4.jobDetails?.buyer?.info.company.url,
                                company_description:
                                    jobDetailsV4.jobDetails?.buyer?.info.company.description,
                                company_summary:
                                    jobDetailsV4.jobDetails?.buyer?.info.company.summary,
                                company_industry:
                                    jobDetailsV4.jobDetails?.buyer?.info.company.profile.industry,
                                company_country:
                                    jobDetailsV4.jobDetails?.buyer?.info.location.country,
                                company_city:
                                    jobDetailsV4.jobDetails?.buyer?.info.location.city,
                                company_state:
                                    jobDetailsV4.jobDetails?.buyer?.info.location.state,
                                company_timezone:
                                    jobDetailsV4.jobDetails?.buyer?.info.location.countryTimezone,
                                job_title: jobDetailsV4.jobDetails.opening.job.info.title,
                                job_description:
                                    jobDetailsV4.jobDetails.opening.job.description,
                                job_id: jobId,
                                detail_api_data: jobDetailsV4,
                            };

                            return result;
                        } else {
                            return jobDetails;
                        }
                    },
                    jobId,
                    authToken,
                    newJobId,
                    gqlToken
                );

                if (data.job_title) {
                    try {
                        const job = new Job({ upwork: data });
                        await job.save();
                        console.log("Job data saved to MongoDB");
                    } catch (error) {
                        console.error("Error saving job data:", error);
                    }
                } else {
                    console.log("Error JobID", jobId);
                    console.log("Error dataJOBDETAIL", data);
                    if (
                        data.error.message.includes(
                            "This Job posting was removed from Marketplace"
                        )
                    ) {
                        try {
                            const updatedJob = await Job.findByIdAndUpdate(
                                jobId,
                                { private: true },
                                { new: true }
                            );
                            if (updatedJob) {
                                console.log("Job set to private successfully");
                            } else {
                                console.log("Job not found");
                            }
                        } catch (error) {
                            console.error("Error updating job privacy:", error);
                        }
                    }
                }
                browserInstance[jobId] = "";
            } else {
                console.log("Job ID not found in the URL.");
            }
        }
    } catch (err) {
        try {
            delete browserInstances[email]; // Remove browser instance from cache
            const { browser } = browserInstance;
            console.log("ERROR in saving data type of error", typeof err);
            console.log("ERROR in saving data", err);
            if (err?.message == "Target closed") {
                delete browserInstances[email];
                if (browser) closeBrowserInstance(browser);
            }
            if (typeof err == "string") {
                if (JSON.parse(err).message == "Session closed") {
                    delete browserInstances[email];
                    if (browser) closeBrowserInstance(browser);
                }
                if (JSON.parse(err).code == 403) {
                    console.log("Job set to private successfully");
                }

                if (JSON.parse(err).code == 401) {
                    console.log("Account updated successfully");
                    // delete browserInstances[email];
                    // await closeBrowserInstance(browser)
                }
            }
            if (browser) closeBrowserInstance(browser);
        } catch (err) { }
    }
}


const createBrowserInstance = async (email, cookies) => {
    try {
        if (!browserInstances[email]) {
            browserInstances[email] = "fetching";

            browser = await puppeteer.launch({
                // executablePath: "/usr/local/bin/chromium",    
                executablePath: executablePath(),
                devtools: false,
                headless: true,
                headless: false,
                defaultViewport: {
                    width: 1440,
                    height: 1080,
                },
                ignoreHTTPSErrors: true,
                args: [
                    "--no-sandbox",
                    "--headless=new",
                    "--disable-setuid-sandbox",                ],
                protocolTimeout: 2400000,
            });

            console.log("using Proxy to create instance1: ", proxy);
            const page = await browser.newPage();
            await page.setUserAgent(randomUseragent.getRandom());
            await page.goto(`https://www.upwork.com/nx/find-work`, {
                timeout: 0,
                waitUntil: "domcontentloaded",
            });
            await page.setCookie(...cookies);
            await page.screenshot({ path: "test.png" });
            // await page.waitForSelector('#onetrust-accept-btn-handler');

            // Click the "Accept All" button
            // await page.click('#onetrust-accept-btn-handler');
            await page.goto("https://www.upwork.com/nx/find-work/", {
                timeout: 0,
                waitUntil: "domcontentloaded",
            });
            browserInstances[email] = { browser, page, jobId: "" };
        }
    } catch (err) {
        console.log("error in opening page", err);
        delete browserInstances[email];
        await closeBrowserInstance(browser);
    }
};