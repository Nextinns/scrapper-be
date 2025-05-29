const puppeteerScraperManager = require('./puppeteerScraperManager');
const { AuthError, PuppeteerError, JobArchivedError } = require('../utils/errors');

const fetchAndSaveJobDetails = async (jobPosting, upworkAccount) => {
    console.log(`Starting to process job: ${jobPosting.upworkJobId} using account ${upworkAccount.email}`);
    jobPosting.status = 'PROCESSING';
    jobPosting.errorMessage = null; // Clear previous errors
    await jobPosting.save();

    let page; // Keep page in broader scope for potential error handling access

    try {
        const instance = await puppeteerScraperManager.getOrCreateBrowserInstance(
            upworkAccount.email,
            upworkAccount.cookies,
        );
        page = instance.page; // Assign to broader scope

        // Helper to find specific cookie needed for GraphQL
        const findGqlToken = (cookiesArray) => {
            if (!cookiesArray || !Array.isArray(cookiesArray)) return null;
            const gqlCookie = cookiesArray.find(cookie => cookie.path === "/nx/create-profile" && cookie.name); // Add cookie.name check
            return gqlCookie ? gqlCookie.value : null;
        };

        const gqlTokenValue = findGqlToken(jobPosting.cookies);

        const upworkLink = jobPosting.link;
        const linkMatch = upworkLink.match(/~(\w+)(\/apply)?\/?$/);
        const upworkInternalJobId = linkMatch ? linkMatch[1] : null;

        if (!upworkInternalJobId) {
            throw new Error(`Could not extract Upwork internal job ID from link: ${upworkLink}`);
        }

        const extractedData = await page.evaluate(
            async (passedJobId, token, internalJobId, gqlTokenValue) => {
                // This function runs in the browser context
                let result = {
                    clientDetails: {},
                    jobDetailsData: {}, // Renamed to avoid confusion with outer scope
                    errorsInEvaluate: []
                };

                console.log(`Starting data extraction for job ID: ${passedJobId}, internal ID: ${internalJobId}`);

                const internalFetchData = async (url, authToken, method = 'GET', body = null) => {
                    try {
                        const headers = {
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
                        };
                        if (method === 'POST' && body) {
                            headers['content-type'] = 'application/json';
                        }

                        const response = await fetch(url, {
                            method: method,
                            headers: headers,
                            referrer: `https://www.upwork.com/ab/proposals/job/~${passedJobId}/apply/`,
                            referrerPolicy: "origin-when-cross-origin",
                            body: body ? JSON.stringify(body) : undefined,
                            mode: 'cors',
                            credentials: 'include', // Important for Upwork APIs
                        });

                        if (response.ok) {
                            return await response.json();
                        } else {
                            // Throw a structured error to be caught and parsed
                            throw new Error(JSON.stringify({
                                code: response.status,
                                message: `API call to ${url} failed with status ${response.status}: ${await response.text()}`,
                            }));
                        }
                    } catch (error) {
                        // Log error within evaluate for browser console, then re-throw
                        console.error(`internalFetchData error for URL ${url}:`, error.message);
                        throw error; // Re-throw: will be caught by the page.evaluate's outer try-catch
                    }
                };

                try {
                    // Fetch job opening details
                    const jobDetailsUrl = `https://www.upwork.com/ab/proposals/api/openings/${passedJobId}`;
                    const jobOpeningData = await internalFetchData(jobDetailsUrl, token);
                    result.jobDetailsData.openingApiData = jobOpeningData;

                    if (!jobOpeningData || !jobOpeningData.opening) {
                        throw new Error(JSON.stringify({ code: 404, message: "Job opening data not found or invalid." }));
                    }
                    const createdByUid = jobOpeningData.opening.createdByUid;
                    result.clientDetails.userId = createdByUid;
                    result.clientDetails.organizationId = jobOpeningData.opening.organizationUid;

                    // Fetch person (client) details using GraphQL
                    const personDetailsResponse = await internalFetchData(
                        "https://www.upwork.com/api/graphql/v1",
                        token,
                        "POST",
                        {
                            query: `
                        query GetTalentProfiles($personIds: [String!]!) {
                          talentProfiles(personIds: $personIds) {
                            profiles {
                              personalData {
                                portrait { portrait500 portrait100 }
                                profileUrl
                                firstName
                                lastName
                                title
                              }
                            }
                          }
                        }
                    `,
                            variables: { personIds: [createdByUid] },
                        }
                    );

                    const profile = personDetailsResponse?.data?.talentProfiles?.profiles[0]?.personalData;
                    if (profile) {
                        result.clientDetails.firstName = profile.firstName;
                        result.clientDetails.lastName = profile.lastName;
                        result.clientDetails.profilePic = profile.portrait?.portrait500 || profile.portrait?.portrait100 || "";
                        result.clientDetails.profileUrl = profile.profileUrl;
                        result.clientDetails.title = profile.title;
                    }


                    // Fetch V4 job details (includes more company info)
                    const jobDetailsV4Url = `https://www.upwork.com/ab/proposals/api/v4/job/details/${passedJobId}`;
                    const jobDetailsV4Data = await internalFetchData(jobDetailsV4Url, token);
                    result.jobDetailsData.detailApiData = jobDetailsV4Data;

                    if (jobDetailsV4Data?.jobDetails?.opening?.job?.info) {
                        result.jobDetailsData.title = jobDetailsV4Data.jobDetails.opening.job.info.title;
                        result.jobDetailsData.description = jobDetailsV4Data.jobDetails.opening.job.description;
                    }
                    if (jobDetailsV4Data?.jobDetails?.buyer?.info) {
                        const companyInfo = jobDetailsV4Data.jobDetails.buyer.info.company;
                        const locationInfo = jobDetailsV4Data.jobDetails.buyer.info.location;
                        result.clientDetails.companyName = companyInfo?.name;
                        result.clientDetails.companyUrl = companyInfo?.url;
                        result.clientDetails.companyDescription = companyInfo?.description;
                        result.clientDetails.companySummary = companyInfo?.summary;
                        result.clientDetails.companyIndustry = companyInfo?.profile?.industry;
                        result.clientDetails.companyCountry = locationInfo?.country;
                        result.clientDetails.companyCity = locationInfo?.city;
                        result.clientDetails.companyState = locationInfo?.state;
                        result.clientDetails.companyTimezone = locationInfo?.countryTimezone;
                    }
                    result.jobDetailsData.idFromUpwork = passedJobId;

                } catch (evaluateError) {
                    // Capture the error from internal fetches within page.evaluate
                    let code = 500;
                    let message = evaluateError.message || 'Unknown error in page.evaluate';
                    try {
                        const parsed = JSON.parse(evaluateError.message);
                        code = parsed.code || code;
                        message = parsed.message || message;
                    } catch (e) { /* not a JSON error message */ }

                    result.errorsInEvaluate.push({ code, message, source: 'page.evaluate.catch' });
                }
                return result; // Always return a result object
            },
            jobPosting.upworkJobId,
            upworkAccount.upworkAuthToken,
            upworkInternalJobId,
            gqlTokenValue
        );

        // Check if page.evaluate itself threw an error that wasn't caught internally (e.g., syntax error in the passed function)
        // or if our structured error was returned.
        if (extractedData.errorsInEvaluate && extractedData.errorsInEvaluate.length > 0) {
            const evalError = extractedData.errorsInEvaluate[0]; // Handle the first error for now
            const errorMessage = evalError.message;
            const statusCode = evalError.code;

            if (statusCode === 401) {
                throw new AuthError(`Unauthorized (401) for job ${jobPosting.upworkJobId}: ${errorMessage}`);
            }
            if (statusCode === 403 || (errorMessage && errorMessage.includes("This Job posting was removed from Marketplace"))) {
                throw new JobArchivedError(`Job ${jobPosting.upworkJobId} removed or forbidden (403): ${errorMessage}`);
            }
            // For other errors from page.evaluate, treat as failed processing
            throw new Error(`Error from page.evaluate for job ${jobPosting.upworkJobId} (status ${statusCode}): ${errorMessage}`);
        }

        // If we reached here and jobDetailsData.title is present, assume success
        if (extractedData.jobDetailsData && extractedData.jobDetailsData.title) {
            jobPosting.clientDetails = extractedData.clientDetails;
            jobPosting.jobDetails = extractedData.jobDetailsData;
            jobPosting.status = 'PROCESSED';
            jobPosting.errorMessage = null;
            await jobPosting.save();
            console.log(`Successfully processed and saved job: ${jobPosting.upworkJobId}`);
        } else {
            // This case means page.evaluate completed but didn't return the expected data structure for success
            // and didn't throw a recognized structured error.
            throw new Error(`Failed to extract complete job details for ${jobPosting.upworkJobId}. Data: ${JSON.stringify(extractedData)}`);
        }

    } 
    catch (error) {
        console.error(`Error processing job ${jobPosting.upworkJobId} with account ${upworkAccount.email}:`, error.name, error.message);

        if (error instanceof AuthError) {
            console.warn(`Authentication error for account ${upworkAccount.email}. Marking for re-auth.`);
            upworkAccount.lastRefreshedAt = new Date(0); // Mark for immediate re-authentication
            await upworkAccount.save();
            throw error; // Re-throw for processUpworkJobs to handle account switching
        } else if (error instanceof JobArchivedError) {
            jobPosting.status = 'ARCHIVED';
            jobPosting.errorMessage = error.message.substring(0, 1000);
        } else if (error.message && (error.message.includes("Target closed") || error.message.includes("Session closed") || error.name === 'PuppeteerError')) {
            // Let processUpworkJobs handle closing this specific browser instance.
            throw new PuppeteerError(`Puppeteer target/session closed for ${upworkAccount.email}: ${error.message}`);
        } else {
            jobPosting.status = 'FAILED_PROCESSING';
            jobPosting.errorMessage = error.message.substring(0, 1000);
        }
        await jobPosting.save(); // Save changes to jobPosting (status, errorMessage)
        // Do not re-throw general errors here if they are handled by updating jobPosting status
    }

};

module.exports = {
    fetchAndSaveJobDetails,
};
