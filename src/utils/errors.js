class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = "AuthError";
        this.statusCode = 401; // HTTP status code for Unauthorized
    }
}

class PuppeteerError extends Error {
    constructor(message) {
        super(message);
        this.name = "PuppeteerError";
        // This is a server-side/internal error, so 500 is generally appropriate
        // if it leads to an HTTP response, or it's caught internally.
    }
}

class JobArchivedError extends Error {
    constructor(message) {
        super(message);
        this.name = "JobArchivedError";
    }
}


module.exports = {
    AuthError,
    PuppeteerError,
    JobArchivedError
};
